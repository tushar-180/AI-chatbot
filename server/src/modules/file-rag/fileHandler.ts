import { parseFile } from "./index";
import { supabaseStorageService } from "../../services/supabaseStorage.service";
import { sha256 } from "../../utils/hash";
import { supabaseAdmin } from "../../config/supabase";
import { splitTextIntoChunks } from "./textSplitter";
import { generateEmbedding } from "../../services/embedding.service";
import { chatRepository } from "../../repositories/chat.repository";
import type { Attachment } from "../../types/chat.types";

export async function processAttachedFile(
    file: Express.Multer.File,
    userId: string,
    existingAttachments: Attachment[] = []
): Promise<{
    fileText: string | null;
    attachments: Attachment[];
}> {
    const fileHash = sha256(file.buffer);
    const existingStoragePath = await chatRepository.findAttachmentByHash(userId, fileHash);

    let storagePath: string;
    let url: string;

    let hasChunks = false;
    let isNewUpload = false;
    if (existingStoragePath) {
        // Reuse
        storagePath = existingStoragePath;
        url = await supabaseStorageService.createSignedUrl(storagePath);

        // Check if chunks exist in Supabase
        const { count, error } = await supabaseAdmin
            .from('file_chunks')
            .select('*', { count: 'exact', head: true })
            .eq('storage_path', storagePath);
        
        if (!error && count && count > 0) {
            hasChunks = true;
        }
    } else {
        // 2. Upload to Supabase
        const uploaded = await supabaseStorageService.uploadDocument(
            file.buffer,
            file.originalname,
            file.mimetype,
            userId
        );
        storagePath = uploaded.path;
        url = uploaded.url;
        isNewUpload = true;
    }

    // 3. Extract text, chunk, and embed if we don't have chunks yet
    if (!hasChunks) {
        try {
            const parsed = await parseFile(file.buffer, file.originalname, file.mimetype);
            
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
                
                // Process chunks in batches to avoid rate limits and speed up execution
                const BATCH_SIZE = 30;
                for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                    const batch = chunks.slice(i, i + BATCH_SIZE);

                    // 1. Generate arrays natively from the promises
                    const batchResults = await Promise.all(
                        batch.map(async (chunk) => {
                            if (!chunk.trim()) return null;
                            try {
                                const embedding = await generateEmbedding(chunk);
                                return {
                                    storage_path: storagePath,
                                    chunk_text: chunk,
                                    embedding: embedding
                                };
                            } catch (embedErr) {
                                console.error("Failed to generate embedding for chunk:", embedErr);
                                return null;
                            }
                        })
                    );

                    // 2. Cleanly filter out failures out of line
                    const rowsToInsert = batchResults.filter((row): row is NonNullable<typeof row> => row !== null);

                    if (rowsToInsert.length > 0) {
                        try {
                            const { error: insertErr } = await supabaseAdmin.from('file_chunks').insert(rowsToInsert);
                            if (insertErr) {
                                console.error("Failed to bulk insert chunks:", insertErr);
                            }
                        } catch (err) {
                            console.error("Error executing bulk insert:", err);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("File parsing/embedding failed:", err);
            if (isNewUpload) {
                // Cleanup newly uploaded file
                await supabaseStorageService.deleteDocument(storagePath);
                await supabaseAdmin.from('file_chunks').delete().eq('storage_path', storagePath);
            }
            throw new Error(`File processing failed: ${(err as Error).message}`);
        }
    }

    const newAttachment: Attachment = {
        url,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
        fileHash,
    };

    return {
        fileText: null, // No longer returning full text, relying on RAG
        attachments: [...existingAttachments, newAttachment],
    };
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
                
                // Delete associated vector chunks from database
                const { error: deleteErr } = await supabaseAdmin.from('file_chunks').delete().eq('storage_path', path);
                if (deleteErr) {
                    throw deleteErr;
                }
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