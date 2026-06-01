// queryResolver.ts
// Overhauled to use LLM for query resolution.
// Support for multi-language and removal of hardcoded patterns.

import { aiService } from "../../services/ai/ai.service";
import type { ChatMessage } from "../../types/chat.types";
import type { ResolvedSearchQuery } from "../../types/web-search.types";
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
    let provider = aiService.getProvider("gemini:gemini-3.1-flash-lite");

    let resolvedQuery = trimmedMessage;
    let isFollowUpQuery = false;
    let liveDataQuery = false;
    let wantsImages = false;

    try {
        let response: string;
        try {
            response = (await provider.generateResponse([
                { role: "user", content: prompt },
            ])).text;
        } catch (primaryError) {
            // Fallback to Gemini 2.0 Flash
            console.warn(
                "[queryResolver] Primary provider failed, attempting fallback to gemini-2.0-flash:",
                primaryError,
            );
            provider = aiService.getProvider("gemini:gemini-2.0-flash");
            response = (await provider.generateResponse([
                { role: "user", content: prompt },
            ])).text;
        }

        // ── Robust JSON extraction ──────────────────────────────
        // 1. Strip common markdown code fences
        const cleanResponse = response
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

        let result: any = null;
        try {
            // 2. Try direct parsing first
            result = JSON.parse(cleanResponse);
        } catch {
            // 3. Fallback: locate the first balanced JSON object
            const start = cleanResponse.indexOf('{');
            if (start !== -1) {
                let depth = 0;
                for (let i = start; i < cleanResponse.length; i++) {
                    if (cleanResponse[i] === '{') depth++;
                    else if (cleanResponse[i] === '}') {
                        depth--;
                        if (depth === 0) {
                            try {
                                result = JSON.parse(cleanResponse.slice(start, i + 1));
                            } catch {
                                // keep result null if slice isn't valid JSON
                            }
                            break;
                        }
                    }
                }
            }
        }

        // 4. Apply extracted values if we got a valid searchQuery
        if (result && result.searchQuery && result.searchQuery.length > 2) {
            resolvedQuery = result.searchQuery;
            isFollowUpQuery = !!result.isFollowUp;
            liveDataQuery = !!result.isLiveData;
            wantsImages = !!result.wantsImages;

            console.log("[queryResolver] Gemini resolved query:", {
                original: trimmedMessage,
                resolved: resolvedQuery,
                isFollowUp: isFollowUpQuery,
                isLiveData: liveDataQuery,
                wantsImages: wantsImages,
            });
        }
    } catch (error) {
        console.error(
            "[queryResolver] LLM query resolution failed, falling back to raw message:",
            error,
        );
        // liveDataQuery is already false by default, no need to reassign
    }

    const normalizedQuery = normalizeQuery(resolvedQuery);

    return {
        rawQuery: trimmedMessage,
        resolvedQuery,
        normalizedQuery,
        cacheKey: liveDataQuery
            ? `live:${normalizedQuery}`
            : `stable:${normalizedQuery}`,
        isFollowUpQuery,
        liveDataQuery,
        wantsImages,
    };
};
