import axios from "axios";
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

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
import { localRerank } from "./reranker";
import { resolveSearchQuery } from "./queryResolver";
import { checkQuota, recordSearch } from "./quota";
import { WEB_GROUNDING_SYSTEM_PROMPT } from "./webSearch.prompts";

import type {
    SearchCandidate,
    SearchRejection,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SEARCH_RESULTS = 10;
const MAX_FETCHED_RESULTS = 10;
const MAX_SOURCE_COUNT = 3;

const MAX_EXCERPT_CHARS = 1000;
const MAX_TEXT_CHARS = 12_000;

const REQUEST_TIMEOUT_MS = 8_000;

const EXTRACTION_CONCURRENCY = 2;

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const LIVE_QUERY_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
};

const logPrefix = "[web-search]";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency Limiter
// ─────────────────────────────────────────────────────────────────────────────

const createLimiter = (concurrency: number) => {
    let active = 0;

    const queue: Array<() => void> = [];

    const next = () => {
        if (active >= concurrency) return;
        const task = queue.shift();
        if (!task) return;
        active += 1;
        task();
    };

    return async <T>(fn: () => Promise<T>): Promise<T> => {
        await new Promise<void>((resolve) => {
            queue.push(resolve);
            next();
        });
        try {
            return await fn();
        } finally {
            active -= 1;
            next();
        }
    };
};

const extractionLimiter = createLimiter(EXTRACTION_CONCURRENCY);

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

const stripHtml = (value?: string) => {
    if (!value) return "";
    return cheerio.load(value).text().replace(/\s+/g, " ").trim();
};

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
// Source Quality Scoring
// ─────────────────────────────────────────────────────────────────────────────

const detectStructuredPageScore = (candidate: SearchCandidate) => {
    const hostname = candidate.hostname.toLowerCase();

    // Institutional / highly structured
    if (
        /(gov|edu|org)$/.test(hostname) ||
        /(wikipedia\.org|reuters\.com|apnews\.com|bloomberg\.com|worldbank\.org)/.test(
            hostname,
        )
    ) {
        return 0.95;
    }

    // Strong editorial
    if (
        /(nytimes\.com|wsj\.com|bbc\.com|theguardian\.com|ft\.com|forbes\.com)/.test(
            hostname,
        )
    ) {
        return 0.8;
    }

    // Community / weak authority
    if (
        /(reddit\.com|quora\.com|medium\.com|blog|forum)/.test(
            hostname + candidate.url,
        )
    ) {
        return 0.25;
    }

    return 0.55;
};

const detectFreshnessScore = (params: {
    publishedAt?: string | null;
    lastModified?: string | null;
    liveDataQuery: boolean;
}) => {
    const dateStr = params.publishedAt || params.lastModified;

    if (!dateStr) {
        return params.liveDataQuery ? 0.35 : 0.55;
    }
    const timestamp = new Date(dateStr).getTime();
    if (!Number.isFinite(timestamp)) {
        return 0.5;
    }
    const ageDays = (Date.now() - timestamp) / (24 * 60 * 60 * 1000);

    if (ageDays <= 1) return 1.0;
    if (ageDays <= 7) return 0.92;
    if (ageDays <= 30) return 0.8;
    if (ageDays <= 180) return 0.6;
    if (ageDays <= 365) return 0.45;

    return 0.25;
};

// ─────────────────────────────────────────────────────────────────────────────
// Smart Extraction Heuristic
// ─────────────────────────────────────────────────────────────────────────────

const shouldExtractPages = (
    query: string,
    candidates: SearchCandidate[],
): boolean => {
    const normalized = query.toLowerCase();

    const simplePatterns = [
        /^(who|what|when|where) (is|was|are|were)\b/i,
        /^(how old|how tall|how many|how much)\b/i,
        /\b(capital of|population of|birthday|born|died)\b/i,
    ];

    const complexPatterns = [
        /\b(compare|analysis|analyze|why|explain|guide|tutorial)\b/i,
        /\b(pros and cons|advantages|disadvantages)\b/i,
        /\b(best|top|most|highest|lowest|ranking|leader)\b/i,
        /\b(statistics|stats|contributions|performance)\b/i,
    ];

    const isSimple = simplePatterns.some((p) => p.test(normalized));

    const isComplex = complexPatterns.some((p) => p.test(normalized));

    const avgSnippetLength =
        candidates.reduce((sum, c) => sum + c.snippet.length, 0) /
        Math.max(candidates.length, 1);

    const snippetsAreRich = avgSnippetLength > 220;

    if (isSimple && snippetsAreRich && !isComplex) {
        console.log(`${logPrefix} Skipping extraction: rich snippet coverage`);

        return false;
    }

    return true;
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

const extractArticleText = (html: string, url: string) => {
    const dom = new JSDOM(html, { url });

    const reader = new Readability(dom.window.document);

    const parsed = reader.parse();

    const text = sanitizeExtractedText(parsed?.textContent || "");

    dom.window.close();

    return text;
};

const fetchExtractedPage = async (candidate: SearchCandidate) => {
    const cached = await getExtractionCache(candidate.url);

    if (cached) return cached;

    return extractionLimiter(async () => {
        try {
            const response = await axios.get<string>(candidate.url, {
                timeout: REQUEST_TIMEOUT_MS,
                headers: DEFAULT_HEADERS,
                validateStatus: (s) => s === 200,
            });

            const text = extractArticleText(response.data, candidate.url);

            if (!text || text.length < 200) return null;

            const page = {
                title: candidate.title,
                url: candidate.url,
                hostname: candidate.hostname,
                snippet: candidate.snippet,
                text,
                publishedAt: candidate.publishedAt,
                lastModified: candidate.lastModified,
                fetchedAt: Date.now(),
            };

            await setExtractionCache(candidate.url, page, STABLE_QUERY_TTL_MS);

            return page;
        } catch (error: any) {
            const errMsg = axios.isAxiosError(error)
                ? `${error.message} (status=${error.response?.status})`
                : String(error);

            console.warn(
                `${logPrefix} Extraction failed: ${candidate.url} ${errMsg}`,
            );
            return null;
        }
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
            title: stripHtml(r.title),
            url: String(r.url || ""),
            hostname: getHostname(r.url),
            snippet: stripHtml(r.content),
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
// Fallback Sources
// ─────────────────────────────────────────────────────────────────────────────

const buildFallbackSources = (
    candidates: SearchCandidate[],
): SearchSource[] => {
    return candidates.slice(0, MAX_SOURCE_COUNT).map((candidate, index) => ({
        id: index + 1,
        title: candidate.title,
        url: candidate.url,
        hostname: candidate.hostname,
        snippet: candidate.snippet,
        excerpt: candidate.snippet.slice(0, MAX_EXCERPT_CHARS),
        score: candidate.searchProviderScore || 0,
        freshnessScore: candidate.freshnessScore,
        structuredScore: candidate.structuredScore,
        publishedAt: candidate.publishedAt,
        lastModified: candidate.lastModified,
    }));
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

        // ─────────────── Extraction
        const diverseCandidates = deduplicateByHostname(candidates);

        const needsExtraction = shouldExtractPages(
            resolved.resolvedQuery,
            diverseCandidates,
        );

        let fetchedPages: ExtractedPage[] = [];

        if (needsExtraction) {
            const extracted = await Promise.all(
                diverseCandidates
                    .slice(0, MAX_FETCHED_RESULTS)
                    .map(fetchExtractedPage),
            );

            fetchedPages = extracted.filter(Boolean) as ExtractedPage[];
        }

        // ─────────────── Rerank
        const scoredPages = fetchedPages.map((page) => ({
            ...page,
            freshnessScore: detectFreshnessScore({
                publishedAt: page.publishedAt,
                lastModified: page.lastModified,
                liveDataQuery: resolved.liveDataQuery,
            }),
            structuredScore: detectStructuredPageScore(page),
        }));

        let sources: SearchSource[] = [];

        if (scoredPages.length > 0) {
            sources = localRerank({
                query: resolved.resolvedQuery,
                pages: scoredPages,
                maxSourceCount: MAX_SOURCE_COUNT,
            });
        }

        const finalSources =
            sources.length > 0
                ? sources
                : buildFallbackSources(diverseCandidates);

        const sourceStrategy =
            sources.length > 0 ? "local-rerank" : "snippet-fallback";

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
                fetchedSourceCount: scoredPages.length,
                cacheHit: cacheTier !== "none",
                cacheTier,
                liveDataQuery: resolved.liveDataQuery,
                skippedExtraction: !needsExtraction,
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
