import { parseDocument } from "../modules/tools/document-parser";
import { supabaseStorageService } from "../services/supabaseStorage.service";
import { textCache } from "./textCache";
import { sha256 } from "./hash";
import { chatRepository } from "../repositories/chat.repository";
import type { Attachment } from "../types/chat.types";

export async function processDocumentFile(
    file: Express.Multer.File,
    userId: string,
    existingAttachments: Attachment[] = []
): Promise<{
    documentText: string | null;
    attachments: Attachment[];
}> {
    const fileHash = sha256(file.buffer);
    const existingStoragePath = await chatRepository.findAttachmentByHash(userId, fileHash);

    let storagePath: string;
    let url: string;

    if (existingStoragePath) {
        // Reuse
        storagePath = existingStoragePath;
        url = await supabaseStorageService.createSignedUrl(storagePath);
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
    }

    // 3. Extract text and cache it
    let documentText: string | null = null;
    try {
        const parsed = await parseDocument(file.buffer, file.originalname, file.mimetype);
        documentText = parsed.success ? parsed.text : null;
        if (documentText) {
            textCache.set(storagePath, documentText);
        }
    } catch (err) {
        console.error("Text extraction failed:", err);
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
        documentText,
        attachments: [...existingAttachments, newAttachment],
    };
}

export async function cleanupChatFiles(chatId: string): Promise<void> {
    // 1. Get all unique Supabase storage paths for this chat
    const storagePaths = await chatRepository.getStoragePathsForChat(chatId);

    // 2. Delete the files from Supabase (don’t fail the whole operation if one fails)
    await Promise.allSettled(
        storagePaths.map(async (path) => {
            try {
                await supabaseStorageService.deleteDocument(path);
            } catch (err) {
                console.error(`Failed to delete Supabase file ${path}:`, err);
            }
        })
    );

    // 3. Delete all messages belonging to this chat
    await chatRepository.deleteMessagesByChatId(chatId);
}