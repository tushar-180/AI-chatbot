import axios from "axios";

import type { ChatMessage } from "../../types/chat.types";

import {
    getGroundingCache,
    getSearchCache,
    setGroundingCache,
    setSearchCache,
} from "./cache";

import { withEstimatedConfidence } from "./confidence";
import { resolveSearchQuery } from "./queryResolver";
import { checkQuota, recordSearch } from "./rateLimiter";
import { heuristicRerank } from "./reranker";
import { WEB_GROUNDING_SYSTEM_PROMPT } from "./webSearch.prompts";

import type {
    SearchCandidate,
    SearchRejection,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

const MAX_SEARCH_RESULTS = 10;
const MAX_SOURCE_COUNT = 5;

const MAX_EXCERPT_CHARS = 1000;
const MAX_RAW_CONTENT_CHARS = 8000;

const REQUEST_TIMEOUT_MS = 8_000;

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const LIVE_QUERY_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 12 * 60 * 60 * 1000;

const logPrefix = "[web-search]";

const getHostname = (value: string) => {
    try {
        return new URL(value).hostname;
    } catch {
        return "";
    }
};

const cleanRawContent = (text: string) => {
    return text
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_RAW_CONTENT_CHARS);
};

const normalizeRootDomain = (hostname: string) => {
    const parts = hostname.toLowerCase().split(".");

    if (parts.length < 2) {
        return hostname.toLowerCase();
    }

    return parts.slice(-2).join(".");
};

const deduplicateByHostname = (
    candidates: SearchCandidate[],
): SearchCandidate[] => {
    const seen = new Map<string, SearchCandidate>();

    for (const candidate of candidates) {
        const rootDomain = normalizeRootDomain(candidate.hostname);

        const existing = seen.get(rootDomain);

        if (!existing) {
            seen.set(rootDomain, candidate);
            continue;
        }

        const existingScore = existing.searchProviderScore || 0;
        const candidateScore = candidate.searchProviderScore || 0;

        if (candidateScore > existingScore) {
            seen.set(rootDomain, candidate);
        }
    }

    return [...seen.values()];
};

const searchTavily = async (query: string, userId?: string) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) return [];

    try {
        const response = await axios.post(
            TAVILY_SEARCH_URL,
            {
                api_key: apiKey,
                query,
                search_depth: "basic",
                max_results: MAX_SEARCH_RESULTS,

                include_answer: false,
                include_raw_content: true,
            },
            {
                timeout: REQUEST_TIMEOUT_MS,
            },
        );

        await recordSearch(userId);

        const results = response.data?.results || [];

        console.log("[web-search] Query:", query);
        console.log("Total Results:", results.length);

        results.forEach((r: any, index: number) => {
            console.log(`[${index + 1}]`);
            console.log("Title :", r.title || "N/A");
            console.log("URL   :", r.url || "N/A");
        });

        console.log("");

        return results.map((r: any) => ({
            title: String(r.title || ""),
            url: String(r.url || ""),
            hostname: getHostname(r.url),
            snippet: String(r.content || ""),
            rawContent: cleanRawContent(String(r.raw_content || "")),
            searchProviderScore: r.score,
            publishedAt: r.published_date || null,
            lastModified: null,
        }));
    } catch (error) {
        console.warn(
            JSON.stringify({
                logPrefix,
                event: "search error",
                error: String(error),
                time: Date.now(),
            }),
        );

        return [];
    }
};

export const webSearchService = {
    async buildGroundingContext(
        query?: string,
        chatMessages: ChatMessage[] = [],
        userId?: string,
    ): Promise<WebGroundingContext | SearchRejection | null> {
        const trimmedQuery = query?.trim();
        if (!trimmedQuery) return null;
        const resolved = resolveSearchQuery(trimmedQuery, chatMessages);
        const cachedGrounding = await getGroundingCache(resolved.cacheKey);
        if (cachedGrounding) {
            return cachedGrounding;
        }
        const cachedSearch = await getSearchCache(resolved.cacheKey);
        let candidates = cachedSearch;
        let cacheTier: "grounding" | "search" | "none" = cachedSearch
            ? "search"
            : "none";

        if (!candidates) {
            const quotaCheck = await checkQuota(userId);

            if (!quotaCheck.allowed) {
                return {
                    rejected: true,
                    reason: quotaCheck.reason,
                    message: quotaCheck.message,
                    retryAfterMs: quotaCheck.retryAfterMs,
                };
            }

            candidates = await searchTavily(resolved.resolvedQuery, userId);

            if (candidates && candidates.length > 0) {
                await setSearchCache(
                    resolved.cacheKey,
                    candidates,
                    resolved.liveDataQuery
                        ? LIVE_QUERY_TTL_MS
                        : STABLE_QUERY_TTL_MS,
                );
            }
        }

        if (!candidates?.length) {
            return null;
        }

        const diverseCandidates = deduplicateByHostname(candidates);

        const topCandidates = heuristicRerank(
            diverseCandidates,
            resolved.resolvedQuery,
            resolved.liveDataQuery,
            MAX_SOURCE_COUNT,
        );

        const finalSources: SearchSource[] = topCandidates.map(
            (candidate, index) => ({
                id: index + 1,
                title: candidate.title,
                url: candidate.url,
                hostname: candidate.hostname,
                snippet: candidate.snippet,
                excerpt:
                    candidate.rawContent ||
                    candidate.snippet.slice(0, MAX_EXCERPT_CHARS),
                score: candidate.combinedScore || 0,
                freshnessScore: candidate.freshnessScore,
                structuredScore: candidate.structuredScore,
                publishedAt: candidate.publishedAt,
                lastModified: candidate.lastModified,
            }),
        );

        const context = withEstimatedConfidence({
            query: resolved.rawQuery,
            resolvedQuery: resolved.resolvedQuery,
            normalizedQuery: resolved.normalizedQuery,
            reusedPreviousQuery: resolved.reusedPreviousQuery,
            liveDataQuery: resolved.liveDataQuery,
            sources: finalSources,
            systemPrompt: WEB_GROUNDING_SYSTEM_PROMPT(
                resolved.resolvedQuery,
                finalSources,
            ),

            citationsMarkdown:
                "\n\nSources:\n" +
                finalSources
                    .map((s) => `[${s.id}] [${s.title}](${s.url})`)
                    .join("\n"),

            debug: {
                searchStrategy: "tavily",
                sourceStrategy: "heuristic-rerank",
                candidateCount: candidates.length,
                fetchedSourceCount: finalSources.length,
                cacheHit: cacheTier !== "none",
                cacheTier,
                liveDataQuery: resolved.liveDataQuery,
            },
        });

        await setGroundingCache(
            resolved.cacheKey,
            context,
            resolved.liveDataQuery ? LIVE_QUERY_TTL_MS : STABLE_QUERY_TTL_MS,
        );

        return context;
    },
};
