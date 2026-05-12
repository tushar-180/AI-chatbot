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
const webSearch_prompts_1 = require("./webSearch.prompts");
const MAX_SEARCH_RESULTS = 5;
const MAX_FETCHED_RESULTS = 3;
const MAX_SOURCE_COUNT = 3;
const MAX_EXCERPT_CHARS = 900;
const MAX_TEXT_CHARS = 12000;
const REQUEST_TIMEOUT_MS = 10000;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
};
const logPrefix = "[web-search]";
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "how", "i", "in", "is", "it", "of", "on", "or", "the", "to",
    "was", "what", "when", "where", "which", "who", "with",
]);
// ---------- Redis/Memory Cache Support ----------
const searchCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const getCachedResults = (query) => {
    const cached = searchCache.get(query.toLowerCase());
    if (cached && cached.expires > Date.now()) {
        return cached.results;
    }
    return null;
};
const setCachedResults = (query, results) => {
    searchCache.set(query.toLowerCase(), {
        results,
        expires: Date.now() + CACHE_TTL_MS,
    });
};
// ---------- Helpers ----------
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
const normalizeWhitespace = (value) => value.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
const sanitizeExtractedText = (value) => {
    const suspiciousLine = /\b(ignore (all|any|previous|above)|system prompt|developer message|follow these instructions|you are chatgpt|assistant:|user:)\b/i;
    return value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !suspiciousLine.test(line))
        .join("\n")
        .slice(0, MAX_TEXT_CHARS);
};
const tokenize = (value) => value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
const chunkText = (text, chunkSize = 900, overlap = 150) => {
    const normalized = text.replace(/\r/g, "");
    const paragraphs = normalized
        .split(/\n{2,}/)
        .map((paragraph) => normalizeWhitespace(paragraph))
        .filter(Boolean);
    const chunks = [];
    let current = "";
    for (const paragraph of paragraphs) {
        const next = current ? `${current}\n\n${paragraph}` : paragraph;
        if (next.length <= chunkSize) {
            current = next;
            continue;
        }
        if (current)
            chunks.push(current);
        if (paragraph.length <= chunkSize) {
            current = paragraph;
            continue;
        }
        let start = 0;
        while (start < paragraph.length) {
            const slice = paragraph.slice(start, start + chunkSize).trim();
            if (slice)
                chunks.push(slice);
            start += Math.max(chunkSize - overlap, 1);
        }
        current = "";
    }
    if (current)
        chunks.push(current);
    return chunks;
};
const scoreChunk = (queryTokens, text, title, snippet) => {
    const haystack = `${title} ${snippet} ${text}`.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
        const matches = haystack.match(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
        score += matches ? matches.length : 0;
    }
    if (title)
        score += 1;
    if (snippet)
        score += 1;
    return score;
};
// ---------- Search Providers ----------
const searchTavily = (query) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const apiKey = process.env.TAVILY_API_KEY || process.env.TAVILY_API;
    if (!apiKey)
        return [];
    try {
        const response = yield axios_1.default.post(TAVILY_SEARCH_URL, {
            api_key: apiKey,
            query: query,
            search_depth: "basic",
            max_results: MAX_SEARCH_RESULTS,
        }, { timeout: REQUEST_TIMEOUT_MS });
        const results = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.results) || [];
        return results.map((r) => ({
            title: stripHtml(r.title),
            url: r.url,
            hostname: getHostname(r.url),
            snippet: stripHtml(r.content),
        }));
    }
    catch (error) {
        const errMsg = axios_1.default.isAxiosError(error) ? `${error.message} (Status: ${(_b = error.response) === null || _b === void 0 ? void 0 : _b.status})` : String(error);
        console.warn(`${logPrefix} Tavily search failed: ${errMsg}`);
        return [];
    }
});
const searchWeb = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const candidates = yield searchTavily(query);
    return {
        candidates,
        strategy: candidates.length > 0 ? "tavily" : null,
    };
});
// ---------- Extraction Pipeline ----------
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
    return readableText.length >= fallbackText.length ? readableText : fallbackText;
};
const fetchBestExcerpt = (result, query) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const response = yield axios_1.default.get(result.url, {
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
        const articleText = extractArticleText(response.data, result.url);
        if (!articleText)
            return null;
        const queryTokens = tokenize(query);
        const chunks = chunkText(articleText);
        const bestChunk = chunks
            .map((chunk) => ({
            chunk,
            score: scoreChunk(queryTokens, chunk, result.title, result.snippet),
        }))
            .sort((a, b) => b.score - a.score)[0] || null;
        if (!bestChunk)
            return null;
        return {
            id: 0,
            title: result.title,
            url: result.url,
            hostname: result.hostname,
            snippet: result.snippet,
            excerpt: bestChunk.chunk.slice(0, MAX_EXCERPT_CHARS),
            score: bestChunk.score,
        };
    }
    catch (error) {
        const errMsg = axios_1.default.isAxiosError(error) ? `${error.message} (Status: ${(_a = error.response) === null || _a === void 0 ? void 0 : _a.status})` : String(error);
        console.warn(`${logPrefix} Fetch failed for ${result.url}: ${errMsg}`);
        return null;
    }
});
const buildFallbackSources = (candidates) => candidates
    .slice(0, MAX_SOURCE_COUNT)
    .map((candidate, index) => ({
    id: index + 1,
    title: candidate.title,
    url: candidate.url,
    hostname: candidate.hostname,
    snippet: candidate.snippet,
    excerpt: candidate.snippet || candidate.title,
    score: 0,
}));
const buildCitationsMarkdown = (sources) => {
    if (!sources.length)
        return "";
    return [
        "",
        "",
        "Sources:",
        ...sources.map(s => `- [${s.id}] [${s.title.replace(/[[\]]/g, "") || s.hostname}](${s.url})`),
    ].join("\n");
};
exports.webSearchService = {
    buildGroundingContext(query) {
        return __awaiter(this, void 0, void 0, function* () {
            const trimmedQuery = query === null || query === void 0 ? void 0 : query.trim();
            if (!trimmedQuery)
                return null;
            const cached = getCachedResults(trimmedQuery);
            const { candidates, strategy } = cached
                ? { candidates: cached, strategy: "tavily" }
                : yield searchWeb(trimmedQuery);
            if (!candidates.length || !strategy)
                return null;
            if (!cached)
                setCachedResults(trimmedQuery, candidates);
            const fetchedSources = (yield Promise.all(candidates
                .slice(0, MAX_FETCHED_RESULTS)
                .map((result) => fetchBestExcerpt(result, trimmedQuery))))
                .filter((s) => Boolean(s))
                .sort((a, b) => b.score - a.score)
                .slice(0, MAX_SOURCE_COUNT)
                .map((s, i) => (Object.assign(Object.assign({}, s), { id: i + 1 })));
            const finalSources = fetchedSources.length > 0 ? fetchedSources : buildFallbackSources(candidates);
            if (!finalSources.length)
                return null;
            const debug = {
                searchStrategy: strategy,
                sourceStrategy: fetchedSources.length > 0 ? "page-extract" : "snippet-fallback",
                candidateCount: candidates.length,
                fetchedSourceCount: fetchedSources.length,
            };
            console.log(`${logPrefix} used sources: ${finalSources.map(s => s.title).join(", ")}`);
            return {
                query: trimmedQuery,
                sources: finalSources,
                systemPrompt: (0, webSearch_prompts_1.WEB_GROUNDING_SYSTEM_PROMPT)(trimmedQuery, finalSources),
                citationsMarkdown: buildCitationsMarkdown(finalSources),
                debug,
            };
        });
    },
};
