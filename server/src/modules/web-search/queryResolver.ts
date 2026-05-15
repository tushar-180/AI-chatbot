// queryResolver.ts
// Overhauled to use LLM for query resolution.
// Support for multi-language and removal of hardcoded patterns.

import { aiService } from "../../services/ai.service";
import type { ChatMessage } from "../../types/chat.types";
import type { ResolvedSearchQuery } from "./webSearch.types";
import { QUERY_RESOLUTION_PROMPT } from "./webSearch.prompts";

/**
 * Normalizes a query string for consistent caching.
 * Supports Unicode characters for multi-language support.
 */
export const normalizeQuery = (query: string): string =>
    query
        .toLowerCase()
        .normalize("NFKD") // Normalize Unicode
        .replace(/['’]/g, "")
        // Keep letters (any language), numbers, spaces, and specific symbols
        .replace(/[^\p{L}\p{N}\s./:-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

/**
 * Resolves the search query using Gemini.
 * Takes the entire chat context and the latest message to generate optimized search terms.
 * No hardcoded patterns - relies on LLM for intent detection.
 */
export const resolveSearchQuery = async (
    latestUserMessage: string,
    chatMessages: ChatMessage[],
): Promise<ResolvedSearchQuery> => {
    const trimmedMessage = latestUserMessage.trim();

    // Limit context to prevent token overflow while keeping enough history
    const contextMessages = chatMessages.slice(-15);

    const history = contextMessages
        .map(
            (m) =>
                `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : " [Multimedia Content] "}`,
        )
        .join("\n\n");

    const prompt = QUERY_RESOLUTION_PROMPT(trimmedMessage, history);

    // Using Gemini 3.1 Flash Lite for fast and accurate query resolution
    const provider = aiService.getProvider("gemini:gemini-3.1-flash-lite");

    let resolvedQuery = trimmedMessage;
    let reusedPreviousQuery = false;
    let liveDataQuery = false;
    let wantsImages = false;

    try {
        const response = await provider.generateResponse([
            { role: "user", content: prompt },
        ]);

        // Clean the response to ensure it's valid JSON (LLMs sometimes add markdown blocks)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response.trim();

        const result = JSON.parse(jsonStr);

        if (result.searchQuery && result.searchQuery.length > 2) {
            resolvedQuery = result.searchQuery;
            reusedPreviousQuery = !!result.isFollowUp;
            liveDataQuery = !!result.isLiveData;
            wantsImages = !!result.wantsImages;

            console.log("[queryResolver] Gemini resolved query:", {
                original: trimmedMessage,
                resolved: resolvedQuery,
                isFollowUp: reusedPreviousQuery,
                isLiveData: liveDataQuery,
                wantsImages: wantsImages,
            });
        }
    } catch (error) {
        console.error(
            "[queryResolver] LLM query resolution failed, falling back to raw message:",
            error,
        );
        liveDataQuery = false;
    }

    const normalizedQuery = normalizeQuery(resolvedQuery);

    return {
        rawQuery: trimmedMessage,
        resolvedQuery,
        normalizedQuery,
        cacheKey: liveDataQuery
            ? `live:${normalizedQuery}`
            : `stable:${normalizedQuery}`,
        reusedPreviousQuery,
        liveDataQuery,
        wantsImages,
    };
};
