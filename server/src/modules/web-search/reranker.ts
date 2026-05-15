import MiniSearch from "minisearch";
import { differenceInDays, parseISO, isValid } from "date-fns";
import type { SearchCandidate, SearchSource } from "./webSearch.types";

// ---------------------------------------------------------------------------
//  Freshness scoring
// ---------------------------------------------------------------------------
export const detectFreshnessScore = (params: {
    publishedAt?: string | null;
    lastModified?: string | null;
    liveDataQuery: boolean;
}): number => {
    const dateStr = params.publishedAt || params.lastModified;
    if (!dateStr) {
        return params.liveDataQuery ? 0.25 : 0.45;
    }
    const date = parseISO(dateStr);
    if (!isValid(date)) return 0.5;

    const ageDays = differenceInDays(new Date(), date);
    if (ageDays <= 1) return 1.0;
    if (ageDays <= 7) return 0.92;
    if (ageDays <= 30) return 0.8;
    if (ageDays <= 180) return 0.6;
    if (ageDays <= 365) return 0.45;
    return 0.25;
};

// ---------------------------------------------------------------------------
//  Domain / page structure authority
// ---------------------------------------------------------------------------
export const detectStructuredPageScore = (
    candidate: SearchCandidate,
): number => {
    const hostname = candidate.hostname.toLowerCase();
    // High authority TLDs
    if (/(gov|edu|org|nic|ac)$/.test(hostname)) return 0.9;
    
    // Global and widely trusted sources
    if (
        /(wikipedia\.org|reuters\.com|apnews\.com|bloomberg\.com|bbc\.com|nytimes\.com|wsj\.com|aljazeera\.com)/.test(
            hostname,
        )
    ) {
        return 0.85;
    }
    
    // Recognise other mainstream news / media / information hubs
    if (/(\.news\.|\.media\.|\.info\.|\.org\.)/.test(hostname)) return 0.65;
    return 0.55; 
};

// ---------------------------------------------------------------------------
//  URL / snippet signals
// ---------------------------------------------------------------------------
const urlSignal = (url: string): number => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        // Social / share pages are usually low value
        if (
            /(share|photo|video|post|status|comment|like|feed|login|signup)/.test(path)
        ) {
            return 0.25;
        }
        // Article / news / blog paths indicate structured content
        // Note: Many non-English sites still use these English keywords in URLs
        if (/(article|news|blog|story|report|wiki|detail|view|20\d{2})/.test(path)) {
            return 0.9;
        }
        return 0.6;
    } catch {
        return 0.5;
    }
};

const snippetSignal = (snippet: string): number => {
    if (!snippet) return 0.2;
    const lenScore = Math.min(snippet.length / 300, 1);
    
    // Check for numerical data (useful for factual queries across languages)
    const numericDensity =
        (snippet.match(/\d/g)?.length ?? 0) / Math.max(snippet.length, 1);
    
    // Check for structure (dates, percentages, or list-like patterns)
    const hasStructuredData = /\d{4}|\d+\s?%|[\d.]+\s?[\p{L}]{1,5}/u.test(snippet);
    
    // Entity detection (capitalized words) - works for many scripts
    const entityHints = (snippet.match(/\p{Lu}\p{Ll}+/gu)?.length ?? 0) / 10;
    
    return (
        lenScore * 0.45 +
        Math.min(numericDensity * 2, 0.25) +
        (hasStructuredData ? 0.2 : 0) +
        Math.min(entityHints, 0.1)
    );
};

const extractabilityScore = (c: SearchCandidate): number => {
    return urlSignal(c.url) * 0.4 + snippetSignal(c.snippet) * 0.5;
};

// ---------------------------------------------------------------------------
//  BM25 scoring via MiniSearch
// ---------------------------------------------------------------------------
const computeBM25Scores = (
    candidates: SearchCandidate[],
    query: string,
): number[] => {
    const miniSearch = new MiniSearch({
        fields: ["title", "snippet"],
        storeFields: ["url"],
        searchOptions: {
            boost: { title: 2.5, snippet: 1.0 },
            fuzzy: 0.15,
            prefix: true,
        },
    });

    const documents = candidates.map((c, idx) => ({
        id: idx,
        title: c.title || "",
        snippet: c.snippet || "",
        url: c.url,
    }));
    miniSearch.addAll(documents);

    const results = miniSearch.search(query);
    const maxScore = results.length > 0 ? results[0].score : 1;
    const scoreMap = new Map<number, number>();
    for (const result of results) {
        scoreMap.set(Number(result.id), result.score / maxScore);
    }

    return candidates.map((_, idx) => scoreMap.get(idx) ?? 0);
};

// ---------------------------------------------------------------------------
//  Tokenization with Unicode support
// ---------------------------------------------------------------------------
const tokenize = (text: string): Set<string> => {
    const words = text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1);
    return new Set(words);
};

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
};

const areDuplicates = (a: SearchCandidate, b: SearchCandidate): boolean => {
    const ta = tokenize(a.title);
    const tb = tokenize(b.title);
    return jaccardSimilarity(ta, tb) > 0.85;
};

// ---------------------------------------------------------------------------
//  Main reranking
// ---------------------------------------------------------------------------

const COMBINED_WEIGHTS = {
    providerScore: 0.3,
    bm25: 0.3,
    extractability: 0.15,
    freshness: 0.15,
    structured: 0.1,
};

export const heuristicRerank = (
    candidates: SearchCandidate[],
    query: string,
    liveDataQuery: boolean,
    maxResults: number,
): SearchCandidate[] => {
    if (!candidates.length) return [];

    const bm25Scores = computeBM25Scores(candidates, query);

    const scored = candidates.map((candidate, index) => {
        const freshnessScore = detectFreshnessScore({
            publishedAt: candidate.publishedAt,
            lastModified: candidate.lastModified,
            liveDataQuery,
        });
        const structuredScore = detectStructuredPageScore(candidate);
        const providerScore = candidate.searchProviderScore ?? 0;
        const extractScore = extractabilityScore(candidate);
        const bm25Score = bm25Scores[index] ?? 0;

        const combinedScore =
            COMBINED_WEIGHTS.providerScore * providerScore +
            COMBINED_WEIGHTS.bm25 * bm25Score +
            COMBINED_WEIGHTS.extractability * extractScore +
            COMBINED_WEIGHTS.freshness * freshnessScore +
            COMBINED_WEIGHTS.structured * structuredScore;

        return {
            ...candidate,
            freshnessScore,
            structuredScore,
            combinedScore,
        };
    });

    scored.sort((a, b) => b.combinedScore! - a.combinedScore!);

    const final: typeof scored = [];
    for (const item of scored) {
        const isDuplicate = final.some((existing) =>
            areDuplicates(item, existing),
        );
        if (!isDuplicate) {
            final.push(item);
            if (final.length >= maxResults) break;
        }
    }

    return final;
};
