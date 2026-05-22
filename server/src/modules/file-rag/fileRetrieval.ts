import { generateEmbedding } from "../../services/embedding.service";
import { supabaseAdmin } from "../../config/supabase";

/**
 * Retrieves relevant file chunks from Supabase pgvector using the
 * last user message as the search query (no LLM rewriting).
 */
export async function retrieveFileContext(
    rawPromptMessages: any[],
    storagePath: string
): Promise<string | null> {
    try {
        // Find the last user message to use as the query
        const lastUserMsg = rawPromptMessages
            .filter(m => m.role === "user")
            .pop();

        if (!lastUserMsg || !lastUserMsg.content) return null;

        const userQuery = lastUserMsg.content.trim();

        console.log(`[RAG] Generating embedding for query: "${userQuery}"`);
        const queryEmbedding = await generateEmbedding(userQuery);

        console.log(`[RAG] Querying Supabase chunks for path: ${storagePath}`);
        const { data: chunks, error } = await supabaseAdmin.rpc(
            'match_file_chunks',   // your PostgreSQL function
            {
                query_embedding: queryEmbedding,
                match_threshold: 0.5,   // adjust if needed
                match_count: 5,
                filter_path: storagePath,
            }
        );

        if (error) {
            console.error("[RAG] RPC error matching file chunks:", error);
            return null;
        }

        if (chunks && chunks.length > 0) {
            console.log(
                `[RAG] Found ${chunks.length} relevant chunk(s). Best similarity: ${chunks[0].similarity}`
            );
            const combinedText = chunks
                .map((c: any) => c.chunk_text)
                .join("\n\n---\n\n");
            return `The user provided a file. Below are the most relevant excerpts from the file related to the user's query:\n\n${combinedText}`;
        } else {
            console.log("[RAG] No chunks met the 0.5 similarity threshold.");
            return `The user provided a file, but no highly relevant sections were found for their query.`;
        }
    } catch (err) {
        console.error("[RAG] Failed to perform file RAG retrieval:", err);
        return null;
    }
}