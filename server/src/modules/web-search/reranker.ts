import { differenceInDays, parseISO, isValid } from "date-fns";
import type { SearchCandidate } from "./webSearch.types";

// ─────────────────────────────────────────────
// Freshness
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// URL structure signal (domain-agnostic)
// ─────────────────────────────────────────────

const urlSignal = (url: string): number => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();

        // low-signal interactive/social endpoints
        if (
            /(share|photo|video|post|status|comment|like)\.php/.test(path) ||
            /(share|photo|video|post|status)/.test(path)
        ) {
            return 0.25;
        }

        // high-signal content structures
        if (/(article|news|blog|story|report|202\d|20\d{2})/.test(path)) {
            return 0.9;
        }

        // neutral
        return 0.6;
    } catch {
        return 0.5;
    }
};

// ─────────────────────────────────────────────
// Snippet quality signal
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Extractability proxy (pre-extraction filter)
// ─────────────────────────────────────────────

const extractabilityScore = (c: SearchCandidate): number => {
    const urlScore = urlSignal(c.url);
    const snippetScore = snippetSignal(c.snippet);

    const textHint = c.snippet && c.snippet.length > 120 ? 0.15 : 0;

    return urlScore * 0.4 + snippetScore * 0.5 + textHint;
};

// ─────────────────────────────────────────────
// Structured authority heuristic (kept minimal)
// ─────────────────────────────────────────────

export const detectStructuredPageScore = (candidate: SearchCandidate) => {
    const hostname = candidate.hostname.toLowerCase();

    // generic authoritative signals only (no domain lists)
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

// ─────────────────────────────────────────────
// Main reranker
// ─────────────────────────────────────────────

export const heuristicRerank = (
    candidates: SearchCandidate[],
    liveDataQuery: boolean,
    maxResults: number,
) => {
    const scored = candidates.map((candidate) => {
        const freshnessScore = detectFreshnessScore({
            publishedAt: candidate.publishedAt,
            lastModified: candidate.lastModified,
            liveDataQuery,
        });

        const structuredScore = detectStructuredPageScore(candidate);
        const providerScore = candidate.searchProviderScore || 0;

        const extractScore = extractabilityScore(candidate);

        const combinedScore =
            providerScore * 0.45 +
            extractScore * 0.25 +
            freshnessScore * 0.2 +
            structuredScore * 0.1;

        return {
            ...candidate,
            freshnessScore,
            structuredScore,
            extractabilityScore: extractScore,
            combinedScore,
        };
    });

    // Sort by score
    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // Lightweight diversity penalty (avoid near-duplicate URLs)
    const final: typeof scored = [];
    const seenPatterns = new Set<string>();

    for (const item of scored) {
        try {
            const u = new URL(item.url);

            // normalize path signature
            const signature = u.pathname.split("/").slice(0, 3).join("/");

            if (seenPatterns.has(signature)) {
                continue;
            }

            seenPatterns.add(signature);
            final.push(item);

            if (final.length >= maxResults) break;
        } catch {
            final.push(item);
            if (final.length >= maxResults) break;
        }
    }

    return final;
};
