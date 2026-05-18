import { tavily } from "@tavily/core";
import { parse } from "tldts";

import type { ChatMessage } from "../../types/chat.types";
import {
    getGroundingCache,
    getSearchCache,
    setGroundingCache,
    setSearchCache,
    getLastSearchPointer,
    setLastSearchPointer,
} from "./cache";
import { withEstimatedConfidence } from "./confidence";
import { resolveSearchQuery } from "./queryResolver";
import { checkQuota, recordSearch, setCooldown } from "./rateLimiter";
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
const MAX_RAW_CONTENT_CHARS = 10000;
const LIVE_QUERY_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 12 * 60 * 60 * 1000;

const logPrefix = "[web-search]";

// ── Helpers ─────────────────────────────────────────────────
const getHostname = (v: string) => {
    try {
        return new URL(v).hostname;
    } catch {
        return "";
    }
};
const cleanRawContent = (t: string) =>
    t
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_RAW_CONTENT_CHARS);

const normalizeRootDomain = (hostname: string) => {
    const parsed = parse(hostname);
    return parsed.domain ?? hostname;
};

const deduplicateByHostname = (candidates: SearchCandidate[]) => {
    const seen = new Map<string, SearchCandidate>();
    for (const c of candidates) {
        const root = normalizeRootDomain(c.hostname);
        const exist = seen.get(root);
        if (
            !exist ||
            (c.searchProviderScore || 0) > (exist.searchProviderScore || 0)
        )
            seen.set(root, c);
    }
    return [...seen.values()];
};

// ── Tavily search with retry ────────────────────────────────
const searchTavily = async (
    query: string,
    wantsImages = false,
    retries = 2,
): Promise<SearchCandidate[]> => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const tvly = tavily({ apiKey });
            const resp = await tvly.search(query, {
                searchDepth: "basic",
                maxResults: MAX_SEARCH_RESULTS,
                includeAnswer: false,
                includeRawContent: "markdown",
                includeImages: wantsImages,
                includeImageDescriptions: wantsImages,
            });
            const results = resp.results || [];
            console.log(
                `${logPrefix} query: ${query}${attempt > 0 ? ` (retry ${attempt})` : ""}`,
            );
            results.forEach((r: any, i: number) => {
                console.log(`[${i + 1}] : title: ${r.title}\n      ${r.url}`);
            });

            return results.map((r: any) => ({
                title: String(r.title || ""),
                url: String(r.url || ""),
                hostname: getHostname(r.url),
                snippet: String(r.content || ""),
                rawContent: cleanRawContent(String(r.rawContent || "")),
                searchProviderScore: r.score,
                publishedAt: r.publishedDate || null,
                lastModified: null,
            }));
        } catch (e) {
            console.warn(
                JSON.stringify({
                    logPrefix,
                    event: "search error",
                    error: String(e),
                    attempt,
                    time: Date.now(),
                }),
            );
            if (attempt === retries) return [];
            await new Promise((resolve) =>
                setTimeout(resolve, 300 * Math.pow(2, attempt)),
            ); // 300, 600, 1200 ms
        }
    }
    return [];
};

// ── Main service ─────────────────────────────────────────────
export const webSearchService = {
    async buildGroundingContext(
        query?: string,
        chatMessages: ChatMessage[] = [],
        userId?: string,
        previousSearch?: { cacheKey: string; sources?: SearchSource[] },
    ): Promise<WebGroundingContext | SearchRejection | null> {
        const trimmed = query?.trim();
        if (!trimmed) return null;

        // 1. External previousSearch fast‑path
        if (previousSearch?.cacheKey) {
            const cached = await getGroundingCache(previousSearch.cacheKey);
            if (cached) {
                console.log(
                    `${logPrefix} Reusing grounding context from provided cache key`,
                );
                return cached;
            }
        }

        // 2. Internal follow‑up detection via Redis pointer (Fast path)
        const pointer = userId ? await getLastSearchPointer(userId) : null;

        // 3. Build the resolved query (Async LLM-powered)
        const resolved = await resolveSearchQuery(trimmed, chatMessages);

        // 4. If the resolved query matches our last search and we have it in cache, return that.
        if (
            pointer &&
            (pointer.resolvedQuery === resolved.resolvedQuery ||
                pointer.cacheKey === resolved.cacheKey)
        ) {
            const cached = await getGroundingCache(pointer.cacheKey);
            if (cached) {
                console.log(
                    `${logPrefix} Reusing grounding context for identical resolved query: "${resolved.resolvedQuery}"`,
                );
                return cached;
            }
        }

        // 4. Check grounding cache for the (possibly merged) query
        const cachedGrounding = await getGroundingCache(resolved.cacheKey);
        if (cachedGrounding) return cachedGrounding;

        // 5. Fetch search candidates
        let candidates = await getSearchCache(resolved.cacheKey);
        let cacheTier: "grounding" | "search" | "none" = candidates
            ? "search"
            : "none";

        if (!candidates) {
            const quota = await checkQuota(userId);
            if (!quota.allowed) {
                return {
                    rejected: true,
                    reason: quota.reason,
                    message: quota.message,
                    retryAfterMs: quota.retryAfterMs,
                };
            }

            candidates = await searchTavily(
                resolved.resolvedQuery,
                resolved.wantsImages,
            );
            if (candidates.length > 0) {
                await setSearchCache(
                    resolved.cacheKey,
                    candidates,
                    resolved.liveDataQuery
                        ? LIVE_QUERY_TTL_MS
                        : STABLE_QUERY_TTL_MS,
                );
            }
        }

        // 6. Merge external previous sources if provided
        if (previousSearch?.sources?.length) {
            const old: SearchCandidate[] = previousSearch.sources.map((s) => ({
                title: s.title,
                url: s.url,
                hostname: s.hostname,
                snippet: s.snippet,
                rawContent: s.excerpt,
                searchProviderScore: s.score,
                publishedAt: s.publishedAt,
                lastModified: s.lastModified,
            }));
            const existingUrls = new Set(candidates.map((c) => c.url));
            const fresh = old.filter((c) => !existingUrls.has(c.url));
            candidates = [...candidates, ...fresh];
        }

        if (!candidates?.length) return null;

        const diverse = deduplicateByHostname(candidates);
        const top = heuristicRerank(
            diverse,
            resolved.resolvedQuery,
            resolved.liveDataQuery,
            MAX_SOURCE_COUNT,
        );

        const finalSources: SearchSource[] = top.map((c, i) => ({
            id: i + 1,
            title: c.title,
            url: c.url,
            hostname: c.hostname,
            snippet: c.snippet,
            excerpt: c.rawContent || c.snippet,
            snippetFallback: !c.rawContent,
            score: c.combinedScore || 0,
            freshnessScore: c.freshnessScore,
            structuredScore: c.structuredScore,
            publishedAt: c.publishedAt,
            lastModified: c.lastModified,
        }));

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

        await recordSearch(userId);
        if (userId) await setCooldown(userId);

        await setGroundingCache(
            resolved.cacheKey,
            context,
            resolved.liveDataQuery ? LIVE_QUERY_TTL_MS : STABLE_QUERY_TTL_MS,
        );

        // Update Redis pointer for the new context (fire‑and‑forget)
        if (userId) {
            setLastSearchPointer(userId, {
                resolvedQuery: resolved.resolvedQuery,
                cacheKey: resolved.cacheKey,
                liveDataQuery: resolved.liveDataQuery,
            }).catch((e) =>
                console.error(
                    "[web-search] Failed to set last search pointer:",
                    e,
                ),
            );
        }

        console.log(
            `${logPrefix} Grounding built for "${resolved.resolvedQuery}" (sources: ${finalSources.length}, strategy: ${cacheTier})`,
        );
        return context;
    },
};
