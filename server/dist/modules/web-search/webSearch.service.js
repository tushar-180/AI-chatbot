"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSearchService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const readability_1 = require("@mozilla/readability");
const jsdom_1 = require("jsdom");
const cache_1 = require("./cache");
const confidence_1 = require("./confidence");
const deduplication_1 = require("./deduplication");
const llamaindex_1 = require("./llamaindex");
const queryResolver_1 = require("./queryResolver");
const webSearch_prompts_1 = require("./webSearch.prompts");
const MAX_SEARCH_RESULTS = 6;
const MAX_FETCHED_RESULTS = 5;
const MAX_SOURCE_COUNT = 3;
const MAX_EXCERPT_CHARS = 900;
const MAX_TEXT_CHARS = 14000;
const REQUEST_TIMEOUT_MS = 10000;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const LIVE_QUERY_TTL_MS = 5 * 60 * 1000;
const LIVE_EXTRACTION_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 6 * 60 * 60 * 1000;
const STABLE_EXTRACTION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
};
const logPrefix = "[web-search]";
const stripHtml = (value) => {
    if (!value)
        return "";
    return cheerio.load(value).text().replace(/\s+/g, " ").trim();
};
const getHostname = (value) => {
    try {
        return new URL(value).hostname;
    }
    catch (_a) {
        return "";
    }
};
const sanitizeExtractedText = (value) => {
    const suspiciousLine = /\b(ignore (all|any|previous|above)|system prompt|developer message|follow these instructions|you are chatgpt|assistant:|user:)\b/i;
    return value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !suspiciousLine.test(line))
        .join("\n")
        .slice(0, MAX_TEXT_CHARS);
};
const detectStructuredPageScore = (candidate) => {
    const haystack = `${candidate.url} ${candidate.title} ${candidate.snippet}`.toLowerCase();
    let score = 0;
    if (/(standings|ranking|rankings|leaderboard|table|stats|statistics|schedule|fixtures|scoreboard|box-score)/.test(haystack)) {
        score += 0.45;
    }
    if (/(espn|nba\.com|nfl\.com|mlb\.com|nhl\.com|premierleague\.com|uefa\.com|fifa\.com|icc-cricket\.com|atptour\.com|wtatennis\.com|fbref\.com|statbunker|flashscore|sofascore|cricbuzz|bcci)/.test(candidate.hostname)) {
        score += 0.45;
    }
    if (/(blog|opinion|review|guide|best-)/.test(haystack)) {
        score -= 0.2;
    }
    return Math.max(0, Math.min(1, score));
};
const detectFreshnessScore = (params) => {
    var _a, _b;
    const urlDateMatch = (_a = params.url) === null || _a === void 0 ? void 0 : _a.match(/(20\d{2})[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])/);
    const snippetDateMatch = (_b = params.snippet) === null || _b === void 0 ? void 0 : _b.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i);
    const dateCandidates = [
        params.publishedAt,
        params.lastModified,
        urlDateMatch === null || urlDateMatch === void 0 ? void 0 : urlDateMatch[0],
        snippetDateMatch === null || snippetDateMatch === void 0 ? void 0 : snippetDateMatch[0],
    ].filter(Boolean);
    if (!dateCandidates.length) {
        return params.liveDataQuery ? 0.25 : 0.45;
    }
    const timestamps = dateCandidates
        .map((value) => new Date(value).getTime())
        .filter((value) => Number.isFinite(value));
    if (!timestamps.length) {
        return params.liveDataQuery ? 0.25 : 0.45;
    }
    const ageHours = (Date.now() - Math.max(...timestamps)) / (60 * 60 * 1000);
    if (ageHours <= 6)
        return 1;
    if (ageHours <= 24)
        return 0.9;
    if (ageHours <= 72)
        return 0.75;
    if (ageHours <= 24 * 7)
        return 0.55;
    if (ageHours <= 24 * 30)
        return 0.35;
    return 0.15;
};
const getTtlMs = (liveDataQuery, kind) => {
    if (kind === "query") {
        return liveDataQuery ? LIVE_QUERY_TTL_MS : STABLE_QUERY_TTL_MS;
    }
    return liveDataQuery ? LIVE_EXTRACTION_TTL_MS : STABLE_EXTRACTION_TTL_MS;
};
const extractArticleText = (html, url) => {
    const dom = new jsdom_1.JSDOM(html, { url });
    const { document } = dom.window;
    document
        .querySelectorAll("script, style, noscript, iframe, form, input, button, select, option, textarea, svg, canvas, nav, footer, header, aside, template, dialog, meta, link")
        .forEach((node) => node.remove());
    const reader = new readability_1.Readability(document);
    const parsed = reader.parse();
    const readableText = sanitizeExtractedText((parsed === null || parsed === void 0 ? void 0 : parsed.textContent) || "");
    const $ = cheerio.load(html);
    $("script, style, noscript, iframe, form, nav, footer, header, aside, svg, canvas").remove();
    const fallbackText = sanitizeExtractedText($.root().text());
    dom.window.close();
    return readableText.length >= fallbackText.length
        ? readableText
        : fallbackText;
};
const searchTavily = (query, liveDataQuery) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const apiKey = process.env.TAVILY_API_KEY || process.env.TAVILY_API;
    if (!apiKey)
        return [];
    try {
        const response = yield axios_1.default.post(TAVILY_SEARCH_URL, {
            api_key: apiKey,
            query,
            search_depth: "basic",
            max_results: MAX_SEARCH_RESULTS,
        }, { timeout: REQUEST_TIMEOUT_MS });
        const results = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.results) || [];
        return results.map((result) => {
            const title = stripHtml(result.title);
            const snippet = stripHtml(result.content);
            const url = String(result.url || "");
            const hostname = getHostname(url);
            const publishedAt = typeof result.published_date === "string" ? result.published_date : null;
            const lastModified = typeof result.last_modified === "string" ? result.last_modified : null;
            const candidate = {
                title,
                url,
                hostname,
                snippet,
                searchProviderScore: typeof result.score === "number" ? result.score : undefined,
                publishedAt,
                lastModified,
            };
            return Object.assign(Object.assign({}, candidate), { freshnessScore: detectFreshnessScore({
                    publishedAt,
                    lastModified,
                    url,
                    snippet,
                    liveDataQuery,
                }), structuredScore: detectStructuredPageScore(candidate) });
        });
    }
    catch (error) {
        const errMsg = axios_1.default.isAxiosError(error)
            ? `${error.message} (Status: ${(_b = error.response) === null || _b === void 0 ? void 0 : _b.status})`
            : String(error);
        console.warn(`${logPrefix} Tavily search failed: ${errMsg}`);
        return [];
    }
});
const fetchExtractedPage = (candidate, liveDataQuery) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const cached = (0, cache_1.getExtractionCache)(candidate.url);
    if (cached)
        return cached;
    try {
        const response = yield axios_1.default.get(candidate.url, {
            timeout: REQUEST_TIMEOUT_MS,
            responseType: "text",
            maxContentLength: 1500000,
            headers: DEFAULT_HEADERS,
            validateStatus: (status) => status >= 200 && status < 400,
        });
        const contentType = String(response.headers["content-type"] || "");
        if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
            return null;
        }
        const text = extractArticleText(response.data, candidate.url);
        if (!text)
            return null;
        const extractedPage = {
            title: candidate.title,
            url: candidate.url,
            hostname: candidate.hostname,
            snippet: candidate.snippet,
            text,
            publishedAt: candidate.publishedAt || null,
            lastModified: String(response.headers["last-modified"] || candidate.lastModified || "") ||
                null,
            fetchedAt: Date.now(),
        };
        (0, cache_1.setExtractionCache)(candidate.url, extractedPage, getTtlMs(liveDataQuery, "extraction"));
        return extractedPage;
    }
    catch (error) {
        const errMsg = axios_1.default.isAxiosError(error)
            ? `${error.message} (Status: ${(_a = error.response) === null || _a === void 0 ? void 0 : _a.status})`
            : String(error);
        console.warn(`${logPrefix} Fetch failed for ${candidate.url}: ${errMsg}`);
        return null;
    }
});
const buildFallbackSources = (candidates) => candidates.slice(0, MAX_SOURCE_COUNT).map((candidate, index) => ({
    id: index + 1,
    title: candidate.title,
    url: candidate.url,
    hostname: candidate.hostname,
    snippet: candidate.snippet,
    excerpt: (candidate.snippet || candidate.title).slice(0, MAX_EXCERPT_CHARS),
    score: (candidate.searchProviderScore || 0) +
        (candidate.freshnessScore || 0) +
        (candidate.structuredScore || 0),
    freshnessScore: candidate.freshnessScore,
    structuredScore: candidate.structuredScore,
    publishedAt: candidate.publishedAt || null,
    lastModified: candidate.lastModified || null,
    cacheHit: Boolean(candidate.extractionCacheHit),
}));
const buildCitationsMarkdown = (sources) => {
    if (!sources.length)
        return "";
    return [
        "",
        "",
        "Sources:",
        ...sources.map((source) => `[${source.id}] [${source.title.replace(/[[\]]/g, "") || source.hostname}](${source.url})`),
    ].join("\n");
};
const searchWeb = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const cached = (0, cache_1.getSearchCache)(params.cacheKey);
    if (cached) {
        return {
            candidates: cached.map((candidate) => (Object.assign(Object.assign({}, candidate), { extractionCacheHit: Boolean((0, cache_1.getExtractionCache)(candidate.url)) }))),
            strategy: "tavily",
            cacheTier: "search",
        };
    }
    const candidates = yield searchTavily(params.query, params.liveDataQuery);
    if (candidates.length) {
        (0, cache_1.setSearchCache)(params.cacheKey, candidates, getTtlMs(params.liveDataQuery, "query"));
    }
    return {
        candidates,
        strategy: candidates.length > 0 ? "tavily" : null,
        cacheTier: "none",
    };
});
exports.webSearchService = {
    buildGroundingContext(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, chatMessages = []) {
            const trimmedQuery = query === null || query === void 0 ? void 0 : query.trim();
            if (!trimmedQuery)
                return null;
            const resolved = (0, queryResolver_1.resolveSearchQuery)(trimmedQuery, chatMessages);
            const cachedGrounding = (0, cache_1.getGroundingCache)(resolved.cacheKey);
            if (cachedGrounding) {
                return Object.assign(Object.assign({}, cachedGrounding), { debug: Object.assign(Object.assign({}, cachedGrounding.debug), { cacheHit: true, cacheTier: "grounding" }) });
            }
            const { candidates, strategy, cacheTier } = yield searchWeb({
                query: resolved.resolvedQuery,
                cacheKey: resolved.cacheKey,
                liveDataQuery: resolved.liveDataQuery,
            });
            if (!candidates.length || !strategy)
                return null;
            let embedTexts;
            try {
                const semanticEmbedder = yield (0, llamaindex_1.createSemanticEmbedder)();
                embedTexts = semanticEmbedder.embedTexts;
            }
            catch (error) {
                console.warn(`${logPrefix} semantic embedder unavailable: ${String(error)}`);
            }
            const dedupedCandidates = yield (0, deduplication_1.deduplicateCandidates)(candidates, {
                getEmbeddings: embedTexts,
            });
            const fetchedPages = (yield Promise.all(dedupedCandidates
                .slice(0, MAX_FETCHED_RESULTS)
                .map((candidate) => fetchExtractedPage(candidate, resolved.liveDataQuery)))).filter((page) => Boolean(page));
            const scoredPages = fetchedPages.map((page) => (Object.assign(Object.assign({}, page), { freshnessScore: detectFreshnessScore({
                    publishedAt: page.publishedAt,
                    lastModified: page.lastModified,
                    url: page.url,
                    snippet: page.snippet,
                    liveDataQuery: resolved.liveDataQuery,
                }), structuredScore: detectStructuredPageScore({
                    title: page.title,
                    url: page.url,
                    hostname: page.hostname,
                    snippet: page.snippet,
                }) })));
            let sources = [];
            try {
                sources = yield (0, llamaindex_1.retrieveAndRerank)({
                    query: resolved.resolvedQuery,
                    pages: scoredPages,
                    maxSourceCount: MAX_SOURCE_COUNT,
                });
            }
            catch (error) {
                console.warn(`${logPrefix} llamaindex retrieval failed: ${String(error)}`);
            }
            const finalSources = sources.length > 0 ? sources : buildFallbackSources(dedupedCandidates);
            if (!finalSources.length)
                return null;
            const context = (0, confidence_1.withEstimatedConfidence)({
                query: resolved.rawQuery,
                resolvedQuery: resolved.resolvedQuery,
                normalizedQuery: resolved.normalizedQuery,
                reusedPreviousQuery: resolved.reusedPreviousQuery,
                liveDataQuery: resolved.liveDataQuery,
                sources: finalSources,
                systemPrompt: (0, webSearch_prompts_1.WEB_GROUNDING_SYSTEM_PROMPT)(resolved.resolvedQuery, finalSources),
                citationsMarkdown: buildCitationsMarkdown(finalSources),
                debug: {
                    searchStrategy: strategy,
                    sourceStrategy: sources.length > 0 ? "llamaindex" : "snippet-fallback",
                    candidateCount: candidates.length,
                    dedupedCandidateCount: dedupedCandidates.length,
                    fetchedSourceCount: scoredPages.length,
                    cacheHit: cacheTier !== "none",
                    cacheTier,
                    liveDataQuery: resolved.liveDataQuery,
                },
            });
            (0, cache_1.setGroundingCache)(resolved.cacheKey, context, getTtlMs(resolved.liveDataQuery, "query"));
            console.log(`${logPrefix} resolved="${resolved.resolvedQuery}" sources=${finalSources
                .map((source) => source.title)
                .join(", ")}`);
            return context;
        });
    },
};
