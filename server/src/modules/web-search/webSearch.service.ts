import axios from "axios";
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { WEB_GROUNDING_SYSTEM_PROMPT } from "./webSearch.prompts";
import type {
    SearchCandidate,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

const MAX_SEARCH_RESULTS = 5;
const MAX_FETCHED_RESULTS = 3;
const MAX_SOURCE_COUNT = 3;
const MAX_EXCERPT_CHARS = 900;
const MAX_TEXT_CHARS = 12000;
const REQUEST_TIMEOUT_MS = 10000;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const DEFAULT_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
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
const searchCache = new Map<string, { results: SearchCandidate[]; expires: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const getCachedResults = (query: string): SearchCandidate[] | null => {
    const cached = searchCache.get(query.toLowerCase());
    if (cached && cached.expires > Date.now()) {
        return cached.results;
    }
    return null;
};

const setCachedResults = (query: string, results: SearchCandidate[]) => {
    searchCache.set(query.toLowerCase(), {
        results,
        expires: Date.now() + CACHE_TTL_MS,
    });
};

// ---------- Helpers ----------

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

const normalizeWhitespace = (value: string) =>
    value.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();

const sanitizeExtractedText = (value: string) => {
    const suspiciousLine =
        /\b(ignore (all|any|previous|above)|system prompt|developer message|follow these instructions|you are chatgpt|assistant:|user:)\b/i;

    return value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !suspiciousLine.test(line))
        .join("\n")
        .slice(0, MAX_TEXT_CHARS);
};

const tokenize = (value: string) =>
    value
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

const chunkText = (text: string, chunkSize = 900, overlap = 150) => {
    const normalized = text.replace(/\r/g, "");
    const paragraphs = normalized
        .split(/\n{2,}/)
        .map((paragraph) => normalizeWhitespace(paragraph))
        .filter(Boolean);

    const chunks: string[] = [];
    let current = "";

    for (const paragraph of paragraphs) {
        const next = current ? `${current}\n\n${paragraph}` : paragraph;
        if (next.length <= chunkSize) {
            current = next;
            continue;
        }

        if (current) chunks.push(current);

        if (paragraph.length <= chunkSize) {
            current = paragraph;
            continue;
        }

        let start = 0;
        while (start < paragraph.length) {
            const slice = paragraph.slice(start, start + chunkSize).trim();
            if (slice) chunks.push(slice);
            start += Math.max(chunkSize - overlap, 1);
        }
        current = "";
    }

    if (current) chunks.push(current);
    return chunks;
};

const scoreChunk = (
    queryTokens: string[],
    text: string,
    title: string,
    snippet: string,
) => {
    const haystack = `${title} ${snippet} ${text}`.toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
        const matches = haystack.match(
            new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
        );
        score += matches ? matches.length : 0;
    }

    if (title) score += 1;
    if (snippet) score += 1;
    return score;
};

// ---------- Search Providers ----------

const searchTavily = async (query: string): Promise<SearchCandidate[]> => {
    const apiKey = process.env.TAVILY_API_KEY || process.env.TAVILY_API;
    if (!apiKey) return [];

    try {
        const response = await axios.post(TAVILY_SEARCH_URL, {
            api_key: apiKey,
            query: query,
            search_depth: "basic",
            max_results: MAX_SEARCH_RESULTS,
        }, { timeout: REQUEST_TIMEOUT_MS });

        const results = response.data?.results || [];
        return results.map((r: any) => ({
            title: stripHtml(r.title),
            url: r.url,
            hostname: getHostname(r.url),
            snippet: stripHtml(r.content),
        }));
    } catch (error: any) {
        const errMsg = axios.isAxiosError(error) ? `${error.message} (Status: ${error.response?.status})` : String(error);
        console.warn(`${logPrefix} Tavily search failed: ${errMsg}`);
        return [];
    }
};

const searchWeb = async (query: string): Promise<{
    candidates: SearchCandidate[];
    strategy: "tavily" | null;
}> => {
    const candidates = await searchTavily(query);
    return {
        candidates,
        strategy: candidates.length > 0 ? "tavily" : null,
    };
};

// ---------- Extraction Pipeline ----------

const extractArticleText = (html: string, url: string) => {
    const dom = new JSDOM(html, { url });
    const { document } = dom.window;

    document
        .querySelectorAll(
            "script, style, noscript, iframe, form, input, button, select, option, textarea, svg, canvas, nav, footer, header, aside, template, dialog, meta, link",
        )
        .forEach((node: Element) => node.remove());

    const reader = new Readability(document);
    const parsed = reader.parse();
    const readableText = sanitizeExtractedText(parsed?.textContent || "");

    const $ = cheerio.load(html);
    $("script, style, noscript, iframe, form, nav, footer, header, aside, svg, canvas").remove();
    const fallbackText = sanitizeExtractedText($.root().text());

    dom.window.close();
    return readableText.length >= fallbackText.length ? readableText : fallbackText;
};

const fetchBestExcerpt = async (
    result: SearchCandidate,
    query: string,
): Promise<SearchSource | null> => {
    try {
        const response = await axios.get<string>(result.url, {
            timeout: REQUEST_TIMEOUT_MS,
            responseType: "text",
            maxContentLength: 1_500_000,
            headers: DEFAULT_HEADERS,
            validateStatus: (status) => status >= 200 && status < 400,
        });

        const contentType = String(response.headers["content-type"] || "");
        if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
            return null;
        }

        const articleText = extractArticleText(response.data, result.url);
        if (!articleText) return null;

        const queryTokens = tokenize(query);
        const chunks = chunkText(articleText);

        const bestChunk =
            chunks
                .map((chunk) => ({
                    chunk,
                    score: scoreChunk(queryTokens, chunk, result.title, result.snippet),
                }))
                .sort((a, b) => b.score - a.score)[0] || null;

        if (!bestChunk) return null;

        return {
            id: 0,
            title: result.title,
            url: result.url,
            hostname: result.hostname,
            snippet: result.snippet,
            excerpt: bestChunk.chunk.slice(0, MAX_EXCERPT_CHARS),
            score: bestChunk.score,
        };
    } catch (error: any) {
        const errMsg = axios.isAxiosError(error) ? `${error.message} (Status: ${error.response?.status})` : String(error);
        console.warn(`${logPrefix} Fetch failed for ${result.url}: ${errMsg}`);
        return null;
    }
};

const buildFallbackSources = (candidates: SearchCandidate[]): SearchSource[] =>
    candidates
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

const buildCitationsMarkdown = (sources: SearchSource[]) => {
    if (!sources.length) return "";
    return [
        "",
        "",
        "Sources:",
        ...sources.map(s => `- [${s.id}] [${s.title.replace(/[[\]]/g, "") || s.hostname}](${s.url})`),
    ].join("\n");
};

export const webSearchService = {
    async buildGroundingContext(query?: string): Promise<WebGroundingContext | null> {
        const trimmedQuery = query?.trim();
        if (!trimmedQuery) return null;

        const cached = getCachedResults(trimmedQuery);

        const { candidates, strategy } = cached 
            ? { candidates: cached, strategy: "tavily" as const } 
            : await searchWeb(trimmedQuery);
        
        if (!candidates.length || !strategy) return null;
        if (!cached) setCachedResults(trimmedQuery, candidates);

        const fetchedSources = (
            await Promise.all(
                candidates
                    .slice(0, MAX_FETCHED_RESULTS)
                    .map((result) => fetchBestExcerpt(result, trimmedQuery)),
            )
        )
            .filter((s): s is SearchSource => Boolean(s))
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SOURCE_COUNT)
            .map((s, i) => ({ ...s, id: i + 1 }));

        const finalSources = fetchedSources.length > 0 ? fetchedSources : buildFallbackSources(candidates);
        if (!finalSources.length) return null;

        const debug = {
            searchStrategy: strategy,
            sourceStrategy: fetchedSources.length > 0 ? "page-extract" as const : "snippet-fallback" as const,
            candidateCount: candidates.length,
            fetchedSourceCount: fetchedSources.length,
        };

        console.log(`${logPrefix} used sources: ${finalSources.map(s => s.title).join(", ")}`);

        return {
            query: trimmedQuery,
            sources: finalSources,
            systemPrompt: WEB_GROUNDING_SYSTEM_PROMPT(trimmedQuery, finalSources),
            citationsMarkdown: buildCitationsMarkdown(finalSources),
            debug,
        };
    },
};
