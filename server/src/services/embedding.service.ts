import { GoogleGenAI } from "@google/genai";

// Initialize the unified client. It looks for process.env.GEMINI_API_KEY by default.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: text,
        config: {
            // Cuts dimensions to 256, keeping 95% accuracy while saving ~91% database space!
            outputDimensionality: 256
        }
    });

    // 1. Safety check: Ensure embeddings wrapper array exists and isn't empty
    if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("Failed to generate embedding: API returned an empty response.");
    }

    // 2. Exact Fix: Extract values and explicitly prove to TypeScript it is not undefined
    const embeddingValues = response.embeddings[0].values;
    console.log("Embedding generated successfully:", embeddingValues?.length);


    if (!embeddingValues) {
        throw new Error("Failed to generate embedding: Embedding values are undefined.");
    }

    // Now TypeScript knows for 100% certainty that this is a strict number[]
    return embeddingValues;
}