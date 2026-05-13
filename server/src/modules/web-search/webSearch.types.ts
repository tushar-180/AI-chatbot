export type SearchSource = {
    id: number;
    title: string;
    url: string;
    hostname: string;
    snippet: string;
    excerpt: string;
    score: number;
    freshnessScore?: number;
    structuredScore?: number;
    publishedAt?: string | null;
    lastModified?: string | null;
    cacheHit?: boolean;
};

export type SearchCandidate = {
    title: string;
    url: string;
    hostname: string;
    snippet: string;
    searchProviderScore?: number;
    publishedAt?: string | null;
    lastModified?: string | null;
    freshnessScore?: number;
    structuredScore?: number;
    extractionCacheHit?: boolean;
};

export type ResolvedSearchQuery = {
    rawQuery: string;
    resolvedQuery: string;
    normalizedQuery: string;
    cacheKey: string;
    reusedPreviousQuery: boolean;
    liveDataQuery: boolean;
};

export type ConfidenceEstimate = {
    score: number;
    label: "low" | "medium" | "high";
    reasons: string[];
};

export type SearchRejection = {
    rejected: true;
    reason:
        | "GLOBAL_DAILY_LIMIT_EXCEEDED"
        | "DAILY_USER_LIMIT_EXCEEDED"
        | "USER_COOLDOWN_ACTIVE";
    message: string;
    retryAfterMs?: number;
};

export type WebGroundingContext = {
    query: string;
    resolvedQuery: string;
    normalizedQuery: string;
    reusedPreviousQuery: boolean;
    liveDataQuery: boolean;
    confidence: ConfidenceEstimate;
    sources: SearchSource[];
    systemPrompt: string;
    citationsMarkdown: string;
    debug: {
        searchStrategy: "tavily";
        sourceStrategy: "local-rerank" | "snippet-fallback";
        candidateCount: number;
        fetchedSourceCount: number;
        cacheHit: boolean;
        cacheTier: "grounding" | "search" | "none";
        liveDataQuery: boolean;
        skippedExtraction?: boolean;
    };
};
