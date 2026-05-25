import { GoogleGenAI } from "@google/genai";

// Initialize the unified client. It looks for process.env.GEMINI_API_KEY by default.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 15000;
const INTER_BATCH_DELAY_MS = 2000; // 2s delay to respect rate limits

export async function generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await generateEmbeddings([text]);
    return embeddings[0];
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const validTexts = texts.filter(t => t.trim().length > 0);
    if (validTexts.length === 0) {
        throw new Error("generateEmbeddings: No valid texts provided.");
    }

    // Just retry the primary model, no fallback.
    // If it throws a 429, the entire API key is rate-limited, so falling back won't help.
    return await withRetry(async () => await embedContent("gemini-embedding-2", validTexts));
}

async function embedContent(modelName: string, texts: string[]): Promise<number[][]> {
    const response = await ai.models.embedContent({
        model: modelName,
        contents: texts,
        config: {
            outputDimensionality: 256
        }
    });

    if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error(`Failed to generate embeddings using ${modelName}: API returned an empty response.`);
    }

    return response.embeddings.map((e, i) => {
        if (!e.values) {
            throw new Error(`Failed to generate embedding for index ${i}: values are undefined.`);
        }
        return e.values;
    });
}

/**
 * Delay helper to avoid hitting Gemini free-tier rate limits (RPM/TPM).
 */
export function interBatchDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY_MS));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const isLastAttempt = attempt === MAX_RETRIES - 1;
            const status = error?.status || error?.httpStatusCode;

            if (status === 429) {
                console.warn(`\n[Embedding] ⚠️ RATE LIMIT HIT (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                const headers = error.headers || error.response?.headers;
                if (headers) {
                    const getHeader = (name: string) => headers[name] || (typeof headers.get === 'function' ? headers.get(name) : undefined);
                    console.warn(`[Rate Limit Headers]:`, {
                        limit: getHeader('x-ratelimit-limit'),
                        remaining: getHeader('x-ratelimit-remaining'),
                        reset: getHeader('x-ratelimit-reset'),
                        retryAfter: getHeader('retry-after')
                    });
                } else {
                    console.warn(`[Rate Limit Headers]: Headers not exposed by the @google/genai SDK error object.`);
                }
                console.warn(`[Error Message]:`, error.message, "\n");
            }

            const isClientError = status >= 400 && status < 500 && status !== 429;
            if (isLastAttempt || isClientError) {
                throw error;
            }

            let delay = BASE_DELAY_MS * Math.pow(2, attempt);
            if (status === 429) {
                const headers = error.headers || error.response?.headers;
                if (headers) {
                    const getHeader = (name: string) => headers[name] || (typeof headers.get === 'function' ? headers.get(name) : undefined);
                    const retryAfter = getHeader('retry-after');
                    if (retryAfter) {
                        const parsedSeconds = parseInt(retryAfter, 10);
                        if (!isNaN(parsedSeconds)) {
                            delay = parsedSeconds * 1000;
                        }
                    }
                }
            }

            console.warn(`[Embedding] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error("withRetry: Exhausted all retries.");
}