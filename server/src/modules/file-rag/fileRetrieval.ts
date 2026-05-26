import { generateEmbedding } from "./services/embedding.service";
import { supabaseAdmin } from "./config/supabase";

/**
 * Retrieves relevant file chunks from Supabase pgvector using the
 * last user message as the search query (no LLM rewriting).
 */
export async function retrieveFileContext(
    rawPromptMessages: any[],
    storagePath: string
): Promise<string | null> {
    try {
        // Build a conversation-aware query from the last 3 user messages
        const userMessages = rawPromptMessages
            .filter(m => m.role === "user")
            .slice(-3);

        if (userMessages.length === 0) return null;

        const queryParts = userMessages
            .map(m => (typeof m.content === 'string' ? m.content.trim() : ''))
            .filter(Boolean);

        if (queryParts.length === 0) return null;

        const userQuery = queryParts.join('\n');

        console.log(`[RAG] Generating embedding for query: "${userQuery}"`);
        const queryEmbedding = await generateEmbedding(userQuery);

        console.log(`[RAG] Querying Supabase chunks for path: ${storagePath}`);
        const { data: chunks, error } = await supabaseAdmin.rpc(
            'match_file_chunks',   // your PostgreSQL function
            {
                query_embedding: queryEmbedding,
                match_threshold: 0.35,   // adjusted for 256 dimensions
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
            console.log("[RAG] No chunks met the 0.35 similarity threshold.");
            return `The user provided a file, but no highly relevant sections were found for their query.`;
        }
    } catch (err) {
        console.error("[RAG] Failed to perform file RAG retrieval:", err);
        return null;
    }
}