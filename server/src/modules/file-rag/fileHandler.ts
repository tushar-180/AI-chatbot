import { parseFile } from "./index";
import fs from "node:fs/promises";
import path from "node:path";
import { supabaseStorageService } from "./services/supabaseStorage.service";
import { sha256 } from "../../utils/hash";
import { supabaseAdmin } from "./config/supabase";
import { splitTextIntoChunks } from "./textSplitter";
import { generateEmbedding, generateEmbeddings, interBatchDelay } from "./services/embedding.service";
import "multer"; // ensures Express.Multer.File namespace is available
import { chatRepository } from "../../repositories/chat.repository";
import type { Attachment } from "../../types/chat.types";

const EMBEDDING_BATCH_SIZE = 32;

export async function processAttachedFile(
    file: Express.Multer.File,
    userId: string,
    existingAttachments: Attachment[] = []
): Promise<{
    fileText: string | null;
    attachments: Attachment[];
}> {
    let fileBuffer: Buffer;
    if (file.buffer) {
        fileBuffer = file.buffer;
    } else if (file.path) {
        fileBuffer = await fs.readFile(file.path);
    } else {
        throw new Error("No file buffer or path provided.");
    }

    try {
        const fileHash = sha256(fileBuffer);
        const existingStoragePath = await chatRepository.findAttachmentByHash(userId, fileHash);

    let storagePath = "";
    let url = "";
    let hasChunks = false;
    let inlineFallback = false;
    let isNewUpload = false;
    let localPath = "";

    // Mirror the file to local /tmp for local MCP servers
    try {
        const tmpDir = path.join("/tmp", "velora-files");
        await fs.mkdir(tmpDir, { recursive: true });
        localPath = path.join(tmpDir, `${fileHash}-${file.originalname}`);
        await fs.writeFile(localPath, fileBuffer);
    } catch (err) {
        console.warn(`[FileHandler] Failed to save local file for MCP servers:`, err);
    }

    if (existingStoragePath) {
        // Reuse
        storagePath = existingStoragePath;
        url = await supabaseStorageService.createSignedUrl(storagePath);

        // Check if chunks exist in Supabase (optimized)
        const { count, error } = await supabaseAdmin
            .from('file_chunks')
            .select('id', { count: 'exact', head: true })
            .eq('storage_path', storagePath);

        if (!error && count && count > 0) {
            hasChunks = true;
        }
    } else {
        // 2. Upload to Supabase (using fileHash to prevent race conditions)
        const uploaded = await supabaseStorageService.uploadDocument(
            fileBuffer,
            file.originalname,
            file.mimetype,
            userId,
            fileHash
        );
        storagePath = uploaded.path;
        url = uploaded.url;
        isNewUpload = true;
    }

    // 3. Extract text, chunk, and embed if we don't have chunks yet
    if (!hasChunks) {
        try {
            // Hard limit text to 100k chars (~25k tokens) to guarantee we stay under the 30k TPM limit
            // and complete the embedding process in a few seconds.
            const parsed = await parseFile(fileBuffer, file.originalname, file.mimetype, { maxLength: 100000 });

            if (!parsed.success) {
                // If it's an unsupported file type (like an image), we gracefully bypass RAG.
                if (parsed.error?.code === 'UNSUPPORTED_FILE') {
                    console.log(`Skipping RAG processing for unsupported file type: ${file.originalname}`);
                } else {
                    // It IS a supported file (like PDF), but it failed to parse.
                    throw new Error(`Failed to parse file: ${parsed.error?.message || 'Unknown error'}`);
                }
            } else if (!parsed.text) {
                // It is a supported file, but it contains no readable text.
                throw new Error("No readable text could be extracted from the document.");
            } else {
                const chunks = await splitTextIntoChunks(parsed.text);
                
                let totalChunks = 0;
                let successfulChunks = 0;
                let failedBatches = 0;

                // Process chunks in batches to avoid rate limits and speed up execution
                for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
                    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);

                    // 1. Cleanly filter out empty chunks
                    const validChunks = batch.filter(chunk => chunk.trim());
                    if (validChunks.length === 0) continue;
                    
                    totalChunks += validChunks.length;

                    try {
                        const embeddings = await generateEmbeddings(validChunks);
                        const rowsToInsert = validChunks.map((chunk, index) => ({
                            storage_path: storagePath,
                            chunk_text: chunk,
                            embedding: embeddings[index]
                        }));
                        
                        const { error: insertErr } = await supabaseAdmin.from('file_chunks').insert(rowsToInsert);
                        if (insertErr) {
                            console.error("Failed to bulk insert chunks:", insertErr);
                            failedBatches++;
                        } else {
                            successfulChunks += validChunks.length;
                        }
                    } catch (embedErr) {
                        console.error("Failed to generate batch embeddings:", embedErr);
                        failedBatches++;
                    }

                    // Add delay between batches to respect rate limits
                    if (i + EMBEDDING_BATCH_SIZE < chunks.length) {
                        await interBatchDelay();
                    }
                }

                // If any batch failed, we treat the entire file as a failure to prevent partial embeddings
                if (failedBatches > 0) {
                    // Clean up any partially inserted chunks
                    await supabaseAdmin.from('file_chunks').delete().eq('storage_path', storagePath);
                    throw new Error(
                        `Embedding failed: ${failedBatches} batch(es) failed. Rolled back all chunks to avoid partial retrieval state.`
                    );
                }
            }
        } catch (err) {
            console.warn(`[FileHandler] RAG processing failed, falling back to inline Gemini API:`, (err as Error).message);
            // Clean up any stray chunks, but DO NOT delete the file from Supabase storage
            // so that Gemini can still download and process it inline.
            if (storagePath) {
                await supabaseAdmin.from('file_chunks').delete().eq('storage_path', storagePath);
            }
            inlineFallback = true;
        }
    }

    const newAttachment: Attachment = {
        url,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
        fileHash,
        localPath,
        inlineFallback: inlineFallback ? true : undefined,
    };

    return {
        fileText: null, // No longer returning full text, relying on RAG
        attachments: [...existingAttachments, newAttachment],
    };
    } finally {
        if (file.path) {
            await fs.unlink(file.path).catch(err => console.error(`Failed to delete temp file ${file.path}:`, err));
        }
    }
}

export async function cleanupChatFiles(chatId: string): Promise<void> {
    // 1. Get all unique Supabase storage paths for this chat
    const storagePaths = await chatRepository.getStoragePathsForChat(chatId);

    // 2. Delete the files from Supabase
    const cleanupResults = await Promise.allSettled(
        storagePaths.map(async (path) => {
            const usagesCount = await chatRepository.countStoragePathUsages(chatId, path);

            // Only delete if no other chat is using this storage path
            if (usagesCount === 0) {
                // Delete actual file from storage
                await supabaseStorageService.deleteDocument(path);
                console.log(`[Cleanup] Deleted file from Supabase storage: ${path}`);

                // Delete associated vector chunks from database
                const { error: deleteErr, count } = await supabaseAdmin
                    .from('file_chunks')
                    .delete()
                    .eq('storage_path', path)
                    .select();
                
                if (deleteErr) {
                    console.error(`[Cleanup] Failed to delete chunks for path ${path}:`, deleteErr);
                    throw deleteErr;
                }
                console.log(`[Cleanup] Deleted ${count || 'unknown'} vector chunks from database for: ${path}`);
            }
        })
    );

    const hasErrors = cleanupResults.some(result => result.status === 'rejected');
    if (hasErrors) {
        console.error(`Failed to cleanup some files or chunks for chat ${chatId}`);
        throw new Error("Failed to completely clean up chat files and chunks. Aborting message deletion.");
    }

    // 3. Delete all messages belonging to this chat
    await chatRepository.deleteMessagesByChatId(chatId);
}