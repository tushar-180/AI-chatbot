export type SearchSource = {
    id: number;
    title: string;
    url: string;
    hostname: string;
    snippet: string;
    excerpt: string;
    snippetFallback: boolean;
    score: number;
    freshnessScore?: number;
    publishedAt?: string | null;
    lastModified?: string | null;
};

export type SearchCandidate = {
    title: string;
    url: string;
    hostname: string;
    snippet: string;
    rawContent?: string;
    searchProviderScore?: number;
    combinedScore?: number;
    publishedAt?: string | null;
    lastModified?: string | null;
    freshnessScore?: number;
};

export type SearchImage = {
    url: string;
    description?: string;
};

export type ResolvedSearchQuery = {
    rawQuery: string;
    resolvedQuery: string;
    normalizedQuery: string;
    cacheKey: string;
    isFollowUpQuery: boolean;
    liveDataQuery: boolean;
    wantsImages: boolean;
};

export type ConfidenceEstimate = {
    score: number;
    label: "low" | "medium" | "high";
    reasons: string[];
};

export type SearchRejection = {
    rejected: true;
    reason:
        | "global_quota_exceeded"
        | "user_quota_exceeded"
        | "cooldown_active"
        | "api_key_missing"
        | "rate_limit_exceeded"
        | "provider_error"
        | "empty_response"
        | "monthly_credits_exhausted";
    message: string;
    retryAfterMs?: number;
};

export type WebGroundingContext = {
    query: string;
    resolvedQuery: string;
    normalizedQuery: string;
    isFollowUpQuery: boolean;
    liveDataQuery: boolean;
    confidence: ConfidenceEstimate;
    sources: SearchSource[];
    images?: SearchImage[];
    systemPrompt: string;
    citationsMarkdown: string;
    debug: {
        searchStrategy: "tavily";
        sourceStrategy: "heuristic-rerank";
        candidateCount: number;
        fetchedSourceCount: number;
        cacheHit: boolean;
        cacheTier: "grounding" | "search" | "none";
        liveDataQuery: boolean;
    };
};
