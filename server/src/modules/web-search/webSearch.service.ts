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
import { deduplicateCandidates } from "./deduplication";
import { localRerank } from "./reranker";
import { resolveSearchQuery } from "./queryResolver";
import { WEB_GROUNDING_SYSTEM_PROMPT } from "./webSearch.prompts";
import type {
  SearchCandidate,
  SearchSource,
  WebGroundingContext,
} from "./webSearch.types";

const MAX_SEARCH_RESULTS = 6;
const MAX_FETCHED_RESULTS = 5;
const MAX_SOURCE_COUNT = 3;
const MAX_EXCERPT_CHARS = 900;
const MAX_TEXT_CHARS = 14_000;
const REQUEST_TIMEOUT_MS = 10_000;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const LIVE_QUERY_TTL_MS = 5 * 60 * 1000;
const LIVE_EXTRACTION_TTL_MS = 10 * 60 * 1000;
const STABLE_QUERY_TTL_MS = 6 * 60 * 60 * 1000;
const STABLE_EXTRACTION_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
};

const logPrefix = "[web-search]";

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
  const suspiciousLine =
    /\b(ignore (all|any|previous|above)|system prompt|developer message|follow these instructions|you are chatgpt|assistant:|user:)\b/i;

  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !suspiciousLine.test(line))
    .join("\n")
    .slice(0, MAX_TEXT_CHARS);
};

const detectStructuredPageScore = (candidate: SearchCandidate) => {
  const haystack =
    `${candidate.url} ${candidate.title} ${candidate.snippet}`.toLowerCase();

  let score = 0;
  if (
    /(standings|ranking|rankings|leaderboard|table|stats|statistics|schedule|fixtures|scoreboard|box-score)/.test(
      haystack,
    )
  ) {
    score += 0.45;
  }
  if (
    /(espn|nba\.com|nfl\.com|mlb\.com|nhl\.com|premierleague\.com|uefa\.com|fifa\.com|icc-cricket\.com|atptour\.com|wtatennis\.com|fbref\.com|statbunker|flashscore|sofascore|cricbuzz|bcci)/.test(
      candidate.hostname,
    )
  ) {
    score += 0.45;
  }
  if (/(blog|opinion|review|guide|best-)/.test(haystack)) {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
};

const detectFreshnessScore = (params: {
  publishedAt?: string | null;
  lastModified?: string | null;
  url?: string;
  snippet?: string;
  liveDataQuery: boolean;
}) => {
  const urlDateMatch = params.url?.match(
    /(20\d{2})[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])/,
  );
  const snippetDateMatch = params.snippet?.match(
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i,
  );

  const dateCandidates = [
    params.publishedAt,
    params.lastModified,
    urlDateMatch?.[0],
    snippetDateMatch?.[0],
  ].filter(Boolean) as string[];

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
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.9;
  if (ageHours <= 72) return 0.75;
  if (ageHours <= 24 * 7) return 0.55;
  if (ageHours <= 24 * 30) return 0.35;
  return 0.15;
};

const getTtlMs = (liveDataQuery: boolean, kind: "query" | "extraction") => {
  if (kind === "query") {
    return liveDataQuery ? LIVE_QUERY_TTL_MS : STABLE_QUERY_TTL_MS;
  }
  return liveDataQuery ? LIVE_EXTRACTION_TTL_MS : STABLE_EXTRACTION_TTL_MS;
};

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
  $(
    "script, style, noscript, iframe, form, nav, footer, header, aside, svg, canvas",
  ).remove();
  const fallbackText = sanitizeExtractedText($.root().text());

  dom.window.close();
  return readableText.length >= fallbackText.length
    ? readableText
    : fallbackText;
};

const searchTavily = async (
  query: string,
  liveDataQuery: boolean,
): Promise<SearchCandidate[]> => {
  const apiKey = process.env.TAVILY_API_KEY || process.env.TAVILY_API;
  if (!apiKey) return [];

  try {
    const response = await axios.post(
      TAVILY_SEARCH_URL,
      {
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: MAX_SEARCH_RESULTS,
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    const results = response.data?.results || [];
    return results.map((result: any) => {
      const title = stripHtml(result.title);
      const snippet = stripHtml(result.content);
      const url = String(result.url || "");
      const hostname = getHostname(url);
      const publishedAt =
        typeof result.published_date === "string" ? result.published_date : null;
      const lastModified =
        typeof result.last_modified === "string" ? result.last_modified : null;
      const candidate: SearchCandidate = {
        title,
        url,
        hostname,
        snippet,
        searchProviderScore:
          typeof result.score === "number" ? result.score : undefined,
        publishedAt,
        lastModified,
      };

      return {
        ...candidate,
        freshnessScore: detectFreshnessScore({
          publishedAt,
          lastModified,
          url,
          snippet,
          liveDataQuery,
        }),
        structuredScore: detectStructuredPageScore(candidate),
      };
    });
  } catch (error: any) {
    const errMsg = axios.isAxiosError(error)
      ? `${error.message} (Status: ${error.response?.status})`
      : String(error);
    console.warn(`${logPrefix} Tavily search failed: ${errMsg}`);
    return [];
  }
};

const fetchExtractedPage = async (
  candidate: SearchCandidate,
  liveDataQuery: boolean,
): Promise<ExtractedPage | null> => {
  const cached = getExtractionCache(candidate.url);
  if (cached) return cached;

  try {
    const response = await axios.get<string>(candidate.url, {
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

    const text = extractArticleText(response.data, candidate.url);
    if (!text) return null;

    const extractedPage: ExtractedPage = {
      title: candidate.title,
      url: candidate.url,
      hostname: candidate.hostname,
      snippet: candidate.snippet,
      text,
      publishedAt: candidate.publishedAt || null,
      lastModified:
        String(response.headers["last-modified"] || candidate.lastModified || "") ||
        null,
      fetchedAt: Date.now(),
    };

    setExtractionCache(
      candidate.url,
      extractedPage,
      getTtlMs(liveDataQuery, "extraction"),
    );
    return extractedPage;
  } catch (error: any) {
    const errMsg = axios.isAxiosError(error)
      ? `${error.message} (Status: ${error.response?.status})`
      : String(error);
    console.warn(`${logPrefix} Fetch failed for ${candidate.url}: ${errMsg}`);
    return null;
  }
};

const buildFallbackSources = (candidates: SearchCandidate[]): SearchSource[] =>
  candidates.slice(0, MAX_SOURCE_COUNT).map((candidate, index) => ({
    id: index + 1,
    title: candidate.title,
    url: candidate.url,
    hostname: candidate.hostname,
    snippet: candidate.snippet,
    excerpt: (candidate.snippet || candidate.title).slice(0, MAX_EXCERPT_CHARS),
    score:
      (candidate.searchProviderScore || 0) +
      (candidate.freshnessScore || 0) +
      (candidate.structuredScore || 0),
    freshnessScore: candidate.freshnessScore,
    structuredScore: candidate.structuredScore,
    publishedAt: candidate.publishedAt || null,
    lastModified: candidate.lastModified || null,
    cacheHit: Boolean(candidate.extractionCacheHit),
  }));

const buildCitationsMarkdown = (sources: SearchSource[]) => {
  if (!sources.length) return "";
  return [
    "",
    "",
    "Sources:",
    ...sources.map(
      (source) =>
        `[${source.id}] [${
          source.title.replace(/[[\]]/g, "") || source.hostname
        }](${source.url})`,
    ),
  ].join("\n");
};

const searchWeb = async (params: {
  query: string;
  cacheKey: string;
  liveDataQuery: boolean;
}) => {
  const cached = getSearchCache(params.cacheKey);
  if (cached) {
    return {
      candidates: cached.map((candidate) => ({
        ...candidate,
        extractionCacheHit: Boolean(getExtractionCache(candidate.url)),
      })),
      strategy: "tavily" as const,
      cacheTier: "search" as const,
    };
  }

  const candidates = await searchTavily(params.query, params.liveDataQuery);
  if (candidates.length) {
    setSearchCache(
      params.cacheKey,
      candidates,
      getTtlMs(params.liveDataQuery, "query"),
    );
  }

  return {
    candidates,
    strategy: candidates.length > 0 ? ("tavily" as const) : null,
    cacheTier: "none" as const,
  };
};

export const webSearchService = {
  async buildGroundingContext(
    query?: string,
    chatMessages: ChatMessage[] = [],
  ): Promise<WebGroundingContext | null> {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) return null;

    const resolved = resolveSearchQuery(trimmedQuery, chatMessages);
    const cachedGrounding = getGroundingCache(resolved.cacheKey);
    if (cachedGrounding) {
      return {
        ...cachedGrounding,
        debug: {
          ...cachedGrounding.debug,
          cacheHit: true,
          cacheTier: "grounding",
        },
      };
    }

    const { candidates, strategy, cacheTier } = await searchWeb({
      query: resolved.resolvedQuery,
      cacheKey: resolved.cacheKey,
      liveDataQuery: resolved.liveDataQuery,
    });

    if (!candidates.length || !strategy) return null;

    const dedupedCandidates = await deduplicateCandidates(candidates);

    const fetchedPages = (
      await Promise.all(
        dedupedCandidates
          .slice(0, MAX_FETCHED_RESULTS)
          .map((candidate) =>
            fetchExtractedPage(candidate, resolved.liveDataQuery),
          ),
      )
    ).filter((page): page is ExtractedPage => Boolean(page));

    const scoredPages = fetchedPages.map((page) => ({
      ...page,
      freshnessScore: detectFreshnessScore({
        publishedAt: page.publishedAt,
        lastModified: page.lastModified,
        url: page.url,
        snippet: page.snippet,
        liveDataQuery: resolved.liveDataQuery,
      }),
      structuredScore: detectStructuredPageScore({
        title: page.title,
        url: page.url,
        hostname: page.hostname,
        snippet: page.snippet,
      }),
    }));

    const sources = localRerank({
      query: resolved.resolvedQuery,
      pages: scoredPages as Array<
        ExtractedPage & { freshnessScore: number; structuredScore: number }
      >,
      maxSourceCount: MAX_SOURCE_COUNT,
    });

    const finalSources =
      sources.length > 0 ? sources : buildFallbackSources(dedupedCandidates);
    if (!finalSources.length) return null;

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
      citationsMarkdown: buildCitationsMarkdown(finalSources),
      debug: {
        searchStrategy: strategy,
        sourceStrategy: sources.length > 0 ? "local-rerank" : "snippet-fallback",
        candidateCount: candidates.length,
        dedupedCandidateCount: dedupedCandidates.length,
        fetchedSourceCount: scoredPages.length,
        cacheHit: cacheTier !== "none",
        cacheTier,
        liveDataQuery: resolved.liveDataQuery,
      },
    });

    setGroundingCache(
      resolved.cacheKey,
      context,
      getTtlMs(resolved.liveDataQuery, "query"),
    );

    console.log(
      `${logPrefix} resolved="${resolved.resolvedQuery}" sources=${finalSources
        .map((source) => source.title)
        .join(", ")}`,
    );

    return context;
  },
};
