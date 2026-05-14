import type { ChatMessage } from "../../types/chat.types";
import type { ResolvedSearchQuery } from "./webSearch.types";

const CURRENT_YEAR = new Date().getUTCFullYear();

const REUSE_PREVIOUS_QUERY_PATTERN =
    /^(search again|try again|refresh|search once more|run that again|rerun)\W*$/i;

/**
 * Queries that genuinely require live/fresh data.
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
 * Queries likely needing current-year expansion.
 */
const CURRENT_YEAR_QUERY_PATTERNS = [
    /\belection/i,
    /\belections/i,
    /\bresults/i,
    /\bnews/i,
    /\bscore/i,
    /\bscores/i,
    /\bstandings/i,
    /\branking/i,
    /\brankings/i,
    /\btable/i,
    /\bfixture/i,
    /\bfixtures/i,
    /\btransfers/i,
    /\btransfer/i,
];

/**
 * Conversational replies depending on previous context.
 */
const CONTEXTUAL_REPLY_PATTERNS = [
    /\b(wrong|incorrect|bad answer|not correct|fake|hallucinated)\b/i,
    /\b(this list|that list|this answer|your answer)\b/i,
    /\b(doesnt make sense|doesn't make sense)\b/i,
    /\b(you missed|missing|thats wrong|that's wrong)\b/i,
    /\b(recheck|verify|double check)\b/i,

    /\b(why not)\b/i,
    /\b(are you sure)\b/i,
    /\b(check again)\b/i,
    /\b(search properly)\b/i,
    /\b(search again)\b/i,
    /\b(use reliable sources)\b/i,
    /\b(look again)\b/i,
    /\b(it happened today)\b/i,

    /\b(but he)\b/i,
    /\b(but she)\b/i,
    /\b(but they)\b/i,
    /\b(he just)\b/i,
    /\b(she just)\b/i,
    /\b(they just)\b/i,
];

/**
 * Temporal correction / repair messages.
 *
 * Example:
 * "this is may 2026"
 * "i meant 2025"
 * "not 2024"
 */
const TEMPORAL_REPAIR_PATTERNS = [
    /\b(this is)\b/i,
    /\b(i meant)\b/i,
    /\b(not 20\d{2})\b/i,
    /\b(in 20\d{2})\b/i,
    /\b(for 20\d{2})\b/i,
    /\b(may|june|july|august|september|october|november|december|january|february|march|april)\s+20\d{2}\b/i,
];

/**
 * Structured follow-up instructions.
 */
const FOLLOW_UP_PATTERNS = [
    /\b(include .+)\b/i,
    /\b(add .+)\b/i,
    /\b(show top \d+)\b/i,
    /\b(sort by .+)\b/i,
    /\b(only .+)\b/i,
    /\b(filter .+)\b/i,
    /\b(with .+)\b/i,
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

        if (
            message.role === "user" &&
            message.content.trim() === latestUserMessage.trim() &&
            index === chatMessages.length - 1
        ) {
            continue;
        }

        if (message.role === "assistant") {
            const resolvedQuery = readResolvedQueryFromMetadata(
                message.metadata,
            );

            if (resolvedQuery) {
                return resolvedQuery;
            }
        }

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

const queryContainsYear = (query: string) => /\b20\d{2}\b/.test(query);

const isContextualReply = (message: string) =>
    CONTEXTUAL_REPLY_PATTERNS.some((pattern) => pattern.test(message));

const isFollowUpMessage = (message: string) =>
    FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(message));

const isTemporalRepairMessage = (message: string) =>
    TEMPORAL_REPAIR_PATTERNS.some((pattern) => pattern.test(message));

const shouldAppendCurrentYear = (query: string) => {
    if (queryContainsYear(query)) {
        return false;
    }

    return CURRENT_YEAR_QUERY_PATTERNS.some((pattern) => pattern.test(query));
};

const applyTemporalRepair = (previousQuery: string, currentMessage: string) => {
    const yearMatch = currentMessage.match(/\b20\d{2}\b/);

    const monthMatch = currentMessage.match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    );

    let repaired = previousQuery;

    // remove old years
    repaired = repaired.replace(/\b20\d{2}\b/g, "");

    if (monthMatch) {
        repaired += ` ${monthMatch[1]}`;
    }

    if (yearMatch) {
        repaired += ` ${yearMatch[0]}`;
    }

    return repaired.replace(/\s+/g, " ").trim();
};

const shouldReusePreviousContext = (
    latestMessage: string,
    previousQuery: string | null,
): boolean => {
    if (!previousQuery) {
        return false;
    }

    if (
        REUSE_PREVIOUS_QUERY_PATTERN.test(latestMessage) ||
        isContextualReply(latestMessage) ||
        isFollowUpMessage(latestMessage) ||
        isTemporalRepairMessage(latestMessage)
    ) {
        return true;
    }

    const overlap = computeSemanticOverlap(latestMessage, previousQuery);

    const currentTokenCount = tokenize(latestMessage).length;

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

    return overlap >= 0.45;
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

    let resolvedQuery =
        reusePrevious && previousQuery
            ? isTemporalRepairMessage(trimmedMessage)
                ? applyTemporalRepair(previousQuery, trimmedMessage)
                : `${previousQuery} ${trimmedMessage}`
            : trimmedMessage;

    resolvedQuery = resolvedQuery.replace(/\s+/g, " ").trim();

    if (shouldAppendCurrentYear(resolvedQuery)) {
        resolvedQuery += ` ${CURRENT_YEAR}`;
    }

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
