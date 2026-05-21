import { parseDocument } from "../modules/tools/document-parser";
import { supabaseStorageService } from "../services/supabaseStorage.service";
import { textCache } from "./textCache";
import type { Attachment } from "../types/chat.types";

interface ProcessedDocument {
    documentText: string | null;        // extracted text (for immediate prompt use)
    attachments: Attachment[];          // updated attachments with storage path
}

export async function processDocumentFile(
    file: Express.Multer.File,
    userId: string,
    existingAttachments: Attachment[] = []
): Promise<ProcessedDocument> {
    // 1. Upload to Supabase
    const { path: storagePath, url } = await supabaseStorageService.uploadDocument(
        file.buffer,
        file.originalname,
        file.mimetype,
        userId,
    );

    // 2. Extract text for immediate use
    let documentText: string | null = null;
    try {
        const parsed = await parseDocument(file.buffer, file.originalname, file.mimetype);
        documentText = parsed.success ? parsed.text : null;
    } catch (err) {
        console.error("Text extraction failed:", err);
    }

    // 3. Cache the text (so later messages in the same chat won’t need to re‑download)
    if (documentText) {
        textCache.set(storagePath, documentText);
    }

    // 4. Build the attachment object with storagePath
    const newAttachment: Attachment = {
        url,                // signed URL for client preview
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
    };

    return {
        documentText,
        attachments: [...existingAttachments, newAttachment],
    };
}