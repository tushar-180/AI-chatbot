import { supabaseAdmin } from '../config/supabase';

const BUCKET_NAME = 'documents';

export const supabaseStorageService = {
    /**
     * Upload a document buffer to Supabase Storage.
     * @returns The public URL of the uploaded file (if bucket is public)
     *          or a signed URL (if bucket is private, but we'll use signed for security).
     */
    async uploadDocument(
        fileBuffer: Buffer,
        fileName: string,
        mimeType: string,
        userId: string,
    ): Promise<{ path: string; url: string }> {
        // Sanitize filename
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${userId}/${Date.now()}-${safeName}`;

        const { data, error } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(filePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw new Error(`File upload failed: ${error.message}`);
        }

        // Since the bucket is private, generate a signed URL that expires in 24 hours.
        const { data: signedData, error: signedError } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, 60 * 60 * 24); // 24 hours

        if (signedError) {
            console.error('Error generating signed URL:', signedError);
            throw new Error('Failed to generate signed URL');
        }

        return {
            path: filePath,
            url: signedData.signedUrl,
        };
    },

    /**
     * Delete a document from storage.
     */
    async deleteDocument(filePath: string): Promise<void> {
        const { error } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .remove([filePath]);

        if (error) {
            console.error('Supabase delete error:', error);
            throw new Error(`File deletion failed: ${error.message}`);
        }
    },

    async createSignedUrl(filePath: string, expiresIn = 60 * 60 * 24): Promise<string> {
        const { data, error } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, expiresIn);
        if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
        return data.signedUrl;
    },
};