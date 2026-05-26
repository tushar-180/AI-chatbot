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
    SearchImage,
    SearchRejection,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

const MAX_SEARCH_RESULTS = 10;
const MAX_SOURCE_COUNT = 5;
const MAX_RAW_CONTENT_CHARS = 10000;
const LIVE_QUERY_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 2 * 60 * 60 * 1000;

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
type TavilySearchResult =
    | { success: true; candidates: SearchCandidate[], images?: SearchImage[] }
    | {
          success: false;
          reason:
              | "api_key_missing"
              | "rate_limit_exceeded"
              | "provider_error"
              | "empty_response";
          message: string;
      };

const searchTavily = async (
    query: string,
    wantsImages = false,
    retries = 2,
): Promise<TavilySearchResult> => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        return {
            success: false,
            reason: "api_key_missing",
            message: "Tavily API key is missing or not configured.",
        };
    }

    let lastError: any = null;

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

            const results = resp && Array.isArray(resp.results) ? resp.results : [];
            console.log(
                `${logPrefix} query: ${query}${attempt > 0 ? ` (retry ${attempt})` : ""}`,
            );
            results.forEach((r: any, i: number) => {
                console.log(`[${i + 1}] : title: ${r.title}\n      ${r.url}`);
            });

            if (results.length === 0) {
                return {
                    success: false,
                    reason: "empty_response",
                    message: `Tavily returned no search results for query: "${query}".`,
                };
            }

            const candidates = results.map((r: any) => ({
                title: String(r.title || ""),
                url: String(r.url || ""),
                hostname: getHostname(r.url),
                snippet: String(r.content || ""),
                rawContent: cleanRawContent(String(r.rawContent || "")),
                searchProviderScore: r.score,
                publishedAt: r.publishedDate || null,
                lastModified: null,
            }));

            const rawImages = wantsImages ? (resp.images ?? []) : [];
            const images = rawImages
                .map((img: any) => ({
                    url: String(img.url || ""),
                    description: img.description || null,
                }))
                .filter(i => i.url.length > 0);
            return {
                success: true,
                candidates,
                ...(images.length > 0 && { images }),
            };
        } catch (e: any) {
            lastError = e;
            console.warn(
                JSON.stringify({
                    logPrefix,
                    event: "search error",
                    error: String(e),
                    attempt,
                    time: Date.now(),
                }),
            );
            if (attempt === retries) {
                break;
            }
            await new Promise((resolve) =>
                setTimeout(resolve, 300 * Math.pow(2, attempt)),
            ); // 300, 600, 1200 ms
        }
    }

    // Classify the last encountered error
    const errString = String(lastError || "").toLowerCase();
    const isRateLimit =
        errString.includes("429") ||
        errString.includes("rate limit") ||
        errString.includes("limit exceeded") ||
        errString.includes("too many requests") ||
        errString.includes("quota");

    const isApiKeyError =
        errString.includes("401") ||
        errString.includes("403") ||
        errString.includes("unauthorized") ||
        errString.includes("invalid api key") ||
        errString.includes("unauthenticated");

    if (isRateLimit) {
        return {
            success: false,
            reason: "rate_limit_exceeded",
            message: "Tavily rate limit or credit quota exceeded.",
        };
    }

    if (isApiKeyError) {
        return {
            success: false,
            reason: "api_key_missing",
            message: "Tavily API key is invalid or unauthorized.",
        };
    }

    return {
        success: false,
        reason: "provider_error",
        message: lastError ? String(lastError.message || lastError) : "Failed to search Tavily.",
    };
};

// ── Main service ─────────────────────────────────────────────
export const webSearchService = {
    async buildGroundingContext(
        query?: string,
        chatMessages: ChatMessage[] = [],
        userId?: string,
        supportsImages = false,
    ): Promise<WebGroundingContext | SearchRejection | null> {
        const trimmed = query?.trim();
        if (!trimmed) return null;

        // 2. Internal follow‑up detection via Redis pointer (Fast path)
        const pointer = userId ? await getLastSearchPointer(userId) : null;

        // 3. Build the resolved query (Async LLM-powered)
        const resolved = await resolveSearchQuery(trimmed, chatMessages);
        if(!supportsImages) resolved.wantsImages = false;

        // 4. If the follow-up resolver points back to the same effective search, reuse the
        // previous grounding cache directly instead of re-querying Tavily.
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
        // Cache tiers are intentionally separate:
        // - grounding: full context already built
        // - search: Tavily results cached, but ranking/prompt assembly still runs
        // - none: real Tavily fetch, which is the only path that should spend quota/cooldown
        let candidates: SearchCandidate[] = [];
        let cacheTier: "grounding" | "search" | "none" = "none";
        let images: SearchImage[] | undefined; // add this up top

        const cachedCandidates = await getSearchCache(resolved.cacheKey);
        if (cachedCandidates) {
            candidates = cachedCandidates;
            cacheTier = "search";
        } else {
            const quota = await checkQuota(userId);
            if (!quota.allowed) {
                return {
                    rejected: true,
                    reason: quota.reason,
                    message: quota.message,
                    retryAfterMs: quota.retryAfterMs,
                };
            }

            const searchResult = await searchTavily(
                resolved.resolvedQuery,
                resolved.wantsImages,
            );

            if (!searchResult.success) {
                return {
                    rejected: true,
                    reason: searchResult.reason,
                    message: searchResult.message,
                };
            }

            candidates = searchResult.candidates;
            images = searchResult.images;
            cacheTier = "none";

            if (candidates.length > 0) {
                // Cache successful Tavily responses so equivalent or follow-up turns can reuse
                // provider results without spending another external search.
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
            publishedAt: c.publishedAt,
            lastModified: c.lastModified,
        }));

        const context = withEstimatedConfidence({
            query: resolved.rawQuery,
            resolvedQuery: resolved.resolvedQuery,
            normalizedQuery: resolved.normalizedQuery,
            // This means the current search depends on prior chat context, not that the text
            // of the prior query was literally reused.
            isFollowUpQuery: resolved.isFollowUpQuery,
            liveDataQuery: resolved.liveDataQuery,
            sources: finalSources,
            images,
            systemPrompt: WEB_GROUNDING_SYSTEM_PROMPT(
                resolved.resolvedQuery,
                finalSources,
                images
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

        // Only real external Tavily searches should count against quota/cooldown.
        if (cacheTier === "none") {
            await recordSearch(userId);
            if (userId) await setCooldown(userId);
        }

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
