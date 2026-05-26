import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * Chunk sizing rationale:
 *   - 2500 chars ≈ 500 tokens — gives each chunk enough semantic density
 *     for meaningful retrieval with 256-dim embeddings.
 *   - 200 char overlap ensures context isn't lost at chunk boundaries.
 *   - Previous values (1000/100) produced chunks too small for reliable similarity search.
 */
export const CHUNK_SIZE = 2500;
export const CHUNK_OVERLAP = 200;

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
});

export async function splitTextIntoChunks(text: string): Promise<string[]> {
    const docs = await splitter.createDocuments([text]);
    return docs.map((doc) => doc.pageContent);
}