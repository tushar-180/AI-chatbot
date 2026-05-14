import axios from "axios";
import { extractPage } from "./extractor";

import type { ChatMessage } from "../../types/chat.types";

import {
    getExtractionCache,
    getGroundingCache,
    getSearchCache,
    setExtractionCache,
    setGroundingCache,
    setSearchCache,
    type ExtractedPage,
} from "./cache";

import { withEstimatedConfidence } from "./confidence";
import { resolveSearchQuery } from "./queryResolver";
import { checkQuota, recordSearch } from "./rateLimiter";
import { heuristicRerank } from "./reranker";
import { WEB_GROUNDING_SYSTEM_PROMPT } from "./webSearch.prompts";
import pLimit from "p-limit";

import type {
    SearchCandidate,
    SearchRejection,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

// ─────────────────────────────────────────────────────────────────────────────
// Suppress parse-srcset warnings from extractus/article-extractor
// ─────────────────────────────────────────────────────────────────────────────
const originalConsoleLog = console.log;
console.log = function (...args) {
    const stack = new Error().stack || "";
    if (
        stack.includes("node_modules/parse-srcset") ||
        stack.includes("node_modules/sanitize-html") ||
        stack.includes("node_modules/@extractus")
    ) {
        return;
    }
    originalConsoleLog.apply(console, args);
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SEARCH_RESULTS = 10;
const MAX_SOURCE_COUNT = 5;

const MAX_EXCERPT_CHARS = 1000;
const MAX_TEXT_CHARS = 12_000;

const REQUEST_TIMEOUT_MS = 8_000;

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const LIVE_QUERY_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 12 * 60 * 60 * 1000;

const logPrefix = "[web-search]";
const extractionLimit = pLimit(2);

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

const getHostname = (value: string) => {
    try {
        return new URL(value).hostname;
    } catch {
        return "";
    }
};

const sanitizeExtractedText = (value: string) => {
    return value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, MAX_TEXT_CHARS);
};

const normalizeRootDomain = (hostname: string) => {
    const parts = hostname.toLowerCase().split(".");
    if (parts.length < 2) {
        return hostname.toLowerCase();
    }
    return parts.slice(-2).join(".");
};

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

const fetchExtractedPage = async (candidate: SearchCandidate) => {
    const cached = await getExtractionCache(candidate.url);
    if (cached) return cached;

    return extractionLimit(async () => {
        try {
            const article = await extractPage(candidate.url, {
                score: candidate.combinedScore,
            });

            if (article?.text) {
                const text = sanitizeExtractedText(article.text);

                if (text && text.length >= 200) {
                    const page: ExtractedPage = {
                        title: article.title || candidate.title,
                        url: candidate.url,
                        hostname: candidate.hostname,
                        snippet: candidate.snippet,
                        text,
                        publishedAt: article.published || candidate.publishedAt,
                        lastModified:
                            (article as any).modified || candidate.lastModified,
                        fetchedAt: Date.now(),
                    };

                    await setExtractionCache(
                        candidate.url,
                        page,
                        STABLE_QUERY_TTL_MS,
                    );

                    return page;
                }
            }
        } catch (error: any) {
            console.warn(
                `${logPrefix} Extraction failed: ${candidate.url}`,
                String(error),
            );
        }

        // ─────────────────────────────────────────────
        // FALLBACK: use Tavily result instead of dropping
        // ─────────────────────────────────────────────

        const fallback: ExtractedPage = {
            title: candidate.title,
            url: candidate.url,
            hostname: candidate.hostname,
            snippet: candidate.snippet,
            text: candidate.snippet, // Tavily content fallback
            publishedAt: candidate.publishedAt,
            lastModified: candidate.lastModified,
            fetchedAt: Date.now(),
        };

        await setExtractionCache(candidate.url, fallback, STABLE_QUERY_TTL_MS);

        return fallback;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Tavily Search
// ─────────────────────────────────────────────────────────────────────────────

const searchTavily = async (query: string, userId?: string) => {
    const apiKey = process.env.TAVILY_API_KEY || process.env.TAVILY_API;
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
                include_raw_content: false,
            },
            { timeout: REQUEST_TIMEOUT_MS },
        );

        await recordSearch(userId);

        return (response.data?.results || []).map((r: any) => ({
            title: String(r.title || ""),
            url: String(r.url || ""),
            hostname: getHostname(r.url),
            snippet: String(r.content || ""),
            searchProviderScore: r.score,
            publishedAt: r.published_date || null,
            lastModified: null,
        }));
    } catch (error) {
        console.warn(`${logPrefix} Tavily search failed: ${String(error)}`);
        return [];
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const webSearchService = {
    async buildGroundingContext(
        query?: string,
        chatMessages: ChatMessage[] = [],
        userId?: string,
    ): Promise<WebGroundingContext | SearchRejection | null> {
        const trimmedQuery = query?.trim();
        if (!trimmedQuery) return null;

        const resolved = resolveSearchQuery(trimmedQuery, chatMessages);

        // ─────────────── Cache (NOW async)
        const cachedGrounding = await getGroundingCache(resolved.cacheKey);
        if (cachedGrounding) return cachedGrounding;

        const cachedSearch = await getSearchCache(resolved.cacheKey);

        let candidates = cachedSearch;
        let cacheTier: "grounding" | "search" | "none" = cachedSearch
            ? "search"
            : "none";

        // ─────────────── Search
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

        if (!candidates?.length) return null;

        // ─────────────── Rerank Candidates
        const diverseCandidates = deduplicateByHostname(candidates);

        const topCandidates = heuristicRerank(
            diverseCandidates,
            resolved.liveDataQuery,
            MAX_SOURCE_COUNT,
        );

        // ─────────────── Extraction
        // We only extract the top candidates that we actually plan to use
        const extracted = await Promise.all(
            topCandidates.map(fetchExtractedPage),
        );
        const fetchedPages = extracted.filter(Boolean) as ExtractedPage[];

        const finalSources: SearchSource[] = topCandidates.map(
            (candidate, index) => {
                const extractedPage = fetchedPages.find(
                    (p) => p.url === candidate.url,
                );

                return {
                    id: index + 1,
                    title: extractedPage?.title || candidate.title,
                    url: candidate.url,
                    hostname: candidate.hostname,
                    snippet: candidate.snippet,
                    excerpt:
                        extractedPage?.text ||
                        candidate.snippet.slice(0, MAX_EXCERPT_CHARS),
                    score: candidate.combinedScore,
                    freshnessScore: candidate.freshnessScore,
                    structuredScore: candidate.structuredScore,
                    publishedAt:
                        extractedPage?.publishedAt || candidate.publishedAt,
                    lastModified:
                        extractedPage?.lastModified || candidate.lastModified,
                };
            },
        );

        const sourceStrategy = "heuristic-rerank";

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
                sourceStrategy,
                candidateCount: candidates.length,
                fetchedSourceCount: fetchedPages.length,
                cacheHit: cacheTier !== "none",
                cacheTier,
                liveDataQuery: resolved.liveDataQuery,
                skippedExtraction: false,
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
