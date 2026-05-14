import MiniSearch from "minisearch";
import { differenceInDays, parseISO, isValid } from "date-fns";
import type { SearchCandidate } from "./webSearch.types";

export const detectFreshnessScore = (params: {
    publishedAt?: string | null;
    lastModified?: string | null;
    liveDataQuery: boolean;
}) => {
    const dateStr = params.publishedAt || params.lastModified;

    if (!dateStr) {
        return params.liveDataQuery ? 0.35 : 0.55;
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

const urlSignal = (url: string): number => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();

        if (
            /(share|photo|video|post|status|comment|like)\.php/.test(path) ||
            /(share|photo|video|post|status)/.test(path)
        ) {
            return 0.25;
        }

        if (/(article|news|blog|story|report|202\d|20\d{2})/.test(path)) {
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

    const numericDensity =
        (snippet.match(/\d/g)?.length || 0) / Math.max(snippet.length, 1);

    const hasStructure =
        /\d{4}|\d+\s?(%|pts|goals|assists|runs|wins|losses)/i.test(snippet);

    const entityHints = (snippet.match(/[A-Z][a-z]+/g)?.length || 0) / 10;

    return (
        lenScore * 0.45 +
        Math.min(numericDensity * 2, 0.25) +
        (hasStructure ? 0.2 : 0) +
        Math.min(entityHints, 0.1)
    );
};

const extractabilityScore = (c: SearchCandidate): number => {
    const urlScore = urlSignal(c.url);
    const snippetScore = snippetSignal(c.snippet);

    const textHint = c.snippet && c.snippet.length > 120 ? 0.15 : 0;

    return urlScore * 0.4 + snippetScore * 0.5 + textHint;
};

export const detectStructuredPageScore = (candidate: SearchCandidate) => {
    const hostname = candidate.hostname.toLowerCase();

    if (/(gov|edu|org)$/.test(hostname)) return 0.9;

    if (
        /(wikipedia\.org|reuters\.com|apnews\.com|bloomberg\.com)/.test(
            hostname,
        )
    ) {
        return 0.85;
    }

    return 0.6;
};

const computeBM25Scores = (candidates: SearchCandidate[], query: string) => {
    const miniSearch = new MiniSearch({
        fields: ["title", "snippet"],
        storeFields: ["url"],
        searchOptions: {
            boost: {
                title: 2,
                snippet: 1,
            },
            fuzzy: 0.1,
            prefix: true,
        },
    });

    const documents = candidates.map((candidate, index) => ({
        id: index,
        title: candidate.title || "",
        snippet: candidate.snippet || "",
        url: candidate.url,
    }));

    miniSearch.addAll(documents);
    const results = miniSearch.search(query);
    const maxScore = results[0]?.score || 1;
    const scoreMap = new Map<number, number>();
    for (const result of results) {
        scoreMap.set(Number(result.id), Number(result.score) / maxScore);
    }
    return candidates.map((_, index) => scoreMap.get(index) || 0);
};

export const heuristicRerank = (
    candidates: SearchCandidate[],
    query: string,
    liveDataQuery: boolean,
    maxResults: number,
) => {
    const bm25Scores = computeBM25Scores(candidates, query);

    const scored = candidates.map((candidate, index) => {
        const freshnessScore = detectFreshnessScore({
            publishedAt: candidate.publishedAt,
            lastModified: candidate.lastModified,
            liveDataQuery,
        });

        const structuredScore = detectStructuredPageScore(candidate);
        const providerScore = candidate.searchProviderScore || 0;
        const extractScore = extractabilityScore(candidate);
        const bm25Score = bm25Scores[index] || 0;
        const combinedScore =
            providerScore * 0.35 +
            bm25Score * 0.3 +
            extractScore * 0.15 +
            freshnessScore * 0.1 +
            structuredScore * 0.1;

        return {
            ...candidate,
            freshnessScore,
            structuredScore,
            extractabilityScore: extractScore,
            bm25Score,
            combinedScore,
        };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    const final: typeof scored = [];
    const seenPatterns = new Set<string>();

    for (const item of scored) {
        try {
            const u = new URL(item.url);
            const signature = u.pathname.split("/").slice(0, 3).join("/");
            if (seenPatterns.has(signature)) {
                continue;
            }
            seenPatterns.add(signature);
            final.push(item);

            if (final.length >= maxResults) {
                break;
            }
        } catch {
            final.push(item);
            if (final.length >= maxResults) {
                break;
            }
        }
    }
    return final;
};
