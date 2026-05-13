import type { ChatMessage } from "../../types/chat.types";
import type { ResolvedSearchQuery } from "./webSearch.types";

const REUSE_PREVIOUS_QUERY_PATTERN =
    /^(search again|try again|refresh|search once more|run that again|rerun)\W*$/i;

/**
 * Queries that genuinely require fresh/live web data.
 * Keep this strict so caches are reused aggressively.
 */
const LIVE_DATA_PATTERNS = [
    /\b(latest|current|today|live|now|breaking)\b/i,
    /\b(this week|this month|this season|this year)\b/i,
    /\b(standings|ranking|rankings|leaderboard|table)\b/i,
    /\b(score|scores|result|results|fixture|fixtures)\b/i,
    /\b(stock price|market cap|exchange rate|weather)\b/i,
    /\b(as of \w+ \d{4})\b/i,
    /\b(trending|top news)\b/i,
];

/**
 * Messages that are NOT new search intents.
 * These are conversational follow-ups reacting to the previous answer.
 */
const FEEDBACK_PATTERNS = [
    /\b(wrong|incorrect|bad answer|not correct|fake|hallucinated)\b/i,
    /\b(this list|that list|this answer|your answer)\b/i,
    /\b(doesnt make sense|doesn't make sense)\b/i,
    /\b(you missed|missing|thats wrong|that's wrong)\b/i,
    /\b(recheck|verify|double check)\b/i,
];

/**
 * Requests that should inherit/search using previous context.
 */
const FOLLOW_UP_PATTERNS = [
    /\b(include .+)\b/i,
    /\b(add .+)\b/i,
    /\b(show top \d+)\b/i,
    /\b(sort by .+)\b/i,
    /\b(only .+)\b/i,
    /\b(with assists|with goals|with stats)\b/i,
    /\b(filter .+)\b/i,
];

const STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "of",
    "in",
    "on",
    "at",
    "to",
    "for",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "and",
    "or",
    "that",
    "this",
    "these",
    "those",
    "please",
    "show",
    "tell",
    "find",
    "look",
    "lookup",
    "search",
    "give",
    "me",
    "about",
    "with",
]);

const normalizeReusableValue = (value: string) =>
    value
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s./:-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const tokenize = (value: string): string[] =>
    normalizeReusableValue(value)
        .split(/\s+/)
        .filter((token) => token.length > 1 && !STOPWORDS.has(token));

const computeSemanticOverlap = (a: string, b: string): number => {
    const aTokens = new Set(tokenize(a));
    const bTokens = new Set(tokenize(b));

    if (!aTokens.size || !bTokens.size) {
        return 0;
    }

    let overlap = 0;

    for (const token of aTokens) {
        if (bTokens.has(token)) {
            overlap += 1;
        }
    }

    return overlap / Math.min(aTokens.size, bTokens.size);
};

const readResolvedQueryFromMetadata = (
    metadata: Record<string, unknown> | undefined,
) => {
    const resolvedQuery = metadata?.resolvedQuery;

    if (typeof resolvedQuery === "string" && resolvedQuery.trim()) {
        return resolvedQuery.trim();
    }

    const query = metadata?.query;

    if (typeof query === "string" && query.trim()) {
        return query.trim();
    }

    return null;
};

const findPreviousResolvedQuery = (
    chatMessages: ChatMessage[],
    latestUserMessage: string,
) => {
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
        const message = chatMessages[index];

        // Skip current user message
        if (
            message.role === "user" &&
            message.content.trim() === latestUserMessage.trim() &&
            index === chatMessages.length - 1
        ) {
            continue;
        }

        // Prefer assistant grounded metadata
        if (message.role === "assistant") {
            const resolvedQuery = readResolvedQueryFromMetadata(
                message.metadata,
            );

            if (resolvedQuery) {
                return resolvedQuery;
            }
        }

        // Fallback to previous user query
        if (
            message.role === "user" &&
            typeof message.content === "string" &&
            message.content.trim()
        ) {
            const webSearchEnabled = Boolean(
                message.metadata?.webSearchEnabled,
            );

            if (
                webSearchEnabled &&
                !REUSE_PREVIOUS_QUERY_PATTERN.test(message.content.trim())
            ) {
                return message.content.trim();
            }
        }
    }

    return null;
};

export const normalizeQuery = (query: string) => normalizeReusableValue(query);

export const isLiveDataQuery = (query: string) =>
    LIVE_DATA_PATTERNS.some((pattern) => pattern.test(query));

const isFeedbackMessage = (message: string) =>
    FEEDBACK_PATTERNS.some((pattern) => pattern.test(message));

const isFollowUpMessage = (message: string) =>
    FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(message));

const shouldReusePreviousContext = (
    latestMessage: string,
    previousQuery: string | null,
): boolean => {
    if (!previousQuery) {
        return false;
    }

    if (
        REUSE_PREVIOUS_QUERY_PATTERN.test(latestMessage) ||
        isFeedbackMessage(latestMessage) ||
        isFollowUpMessage(latestMessage)
    ) {
        return true;
    }

    /**
     * Semantic overlap detection:
     *
     * Example:
     * Previous: "top ai startups 2026"
     * Current: "which one raised most funding"
     *
     * Current message lacks standalone search meaning.
     */

    const overlap = computeSemanticOverlap(latestMessage, previousQuery);

    const currentTokenCount = tokenize(latestMessage).length;

    // Short ambiguous follow-ups inherit context
    if (currentTokenCount <= 6 && overlap < 0.35) {
        const ambiguousPatterns = [
            /\b(which one|which ones|who|what about|how about)\b/i,
            /\b(and .+)\b/i,
            /\b(compare .+)\b/i,
            /\b(top \d+)\b/i,
            /\b(with .+)\b/i,
            /\b(only .+)\b/i,
        ];

        if (ambiguousPatterns.some((p) => p.test(latestMessage))) {
            return true;
        }
    }

    return false;
};

export const resolveSearchQuery = (
    latestUserMessage: string,
    chatMessages: ChatMessage[],
): ResolvedSearchQuery => {
    const trimmedMessage = latestUserMessage.trim();

    const previousQuery = findPreviousResolvedQuery(
        chatMessages,
        latestUserMessage,
    );

    const reusePrevious = shouldReusePreviousContext(
        trimmedMessage,
        previousQuery,
    );

    const resolvedQuery =
        reusePrevious && previousQuery
            ? `${previousQuery} ${trimmedMessage}`
            : trimmedMessage;

    const normalizedQuery = normalizeQuery(resolvedQuery);

    const liveDataQuery = isLiveDataQuery(resolvedQuery);

    return {
        rawQuery: trimmedMessage,
        resolvedQuery,
        normalizedQuery,
        cacheKey: liveDataQuery
            ? `live:${normalizedQuery}`
            : `stable:${normalizedQuery}`,
        reusedPreviousQuery: reusePrevious,
        liveDataQuery,
    };
};
