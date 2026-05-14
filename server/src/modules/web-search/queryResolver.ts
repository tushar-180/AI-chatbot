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
 * Expanded conversational replies that should reuse previous context.
 */
const CONTEXTUAL_REPLY_PATTERNS = [
    // Existing
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
    /\b(but he|but she|but they)\b/i,
    /\b(he just|she just|they just)\b/i,

    // New – confirmation & refinement
    /\b(can you confirm|confirm that|verify that|check that)\b/i,
    /\b(actually|wait|but)\s+(it is|it's|that is|that's)\b/i,
    /\b(around|approximately|about)\s+\d+(?:\.\d+)?\b/i, // "around 225"
    /\b(you said|you mentioned|you told me)\b/i,
    /\b(really\?|are you certain|is that correct)\b/i,
    /\b(i think it's|i believe it's)\s+\d+(?:\.\d+)?\b/i,
];

/**
 * Temporal correction / repair messages.
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

// ------------------------------------------------------------------
// Normalisation & tokenisation (unchanged)
// ------------------------------------------------------------------
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
    if (!aTokens.size || !bTokens.size) return 0;
    let overlap = 0;
    for (const token of aTokens) {
        if (bTokens.has(token)) overlap++;
    }
    return overlap / Math.min(aTokens.size, bTokens.size);
};

// ------------------------------------------------------------------
// Extract numbers from a string (including decimals)
// ------------------------------------------------------------------
const extractNumbers = (text: string): number[] => {
    const matches = text.match(/\b\d+(?:\.\d+)?\b/g);
    if (!matches) return [];
    return matches.map(Number).filter((n) => !isNaN(n));
};

// Check if two numbers are “close” (within 1% or absolute difference <= 2)
const isCloseNumber = (a: number, b: number): boolean => {
    if (a === b) return true;
    const diff = Math.abs(a - b);
    if (diff <= 2) return true;
    const percentDiff = diff / Math.max(Math.abs(a), Math.abs(b));
    return percentDiff <= 0.01; // 1% tolerance
};

// ------------------------------------------------------------------
// Get previous assistant's content (the last assistant message)
// ------------------------------------------------------------------
const getLastAssistantContent = (
    chatMessages: ChatMessage[],
): string | null => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
        if (chatMessages[i].role === "assistant") {
            const content = chatMessages[i].content;
            if (typeof content === "string" && content.trim()) {
                return content.trim();
            }
        }
    }
    return null;
};

// ------------------------------------------------------------------
// Read resolved query from assistant metadata (unchanged)
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// Find the most recent resolved query (unchanged logic)
// ------------------------------------------------------------------
const findPreviousResolvedQuery = (
    chatMessages: ChatMessage[],
    latestUserMessage: string,
) => {
    for (let index = chatMessages.length - 1; index >= 0; index--) {
        const message = chatMessages[index];
        // Skip the current user message if it's already stored
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
            if (resolvedQuery) return resolvedQuery;
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

// ------------------------------------------------------------------
// Determine if we should reuse the previous context (enhanced)
// ------------------------------------------------------------------
const shouldReusePreviousContext = (
    latestMessage: string,
    previousQuery: string | null,
    chatMessages: ChatMessage[],
): boolean => {
    if (!previousQuery) return false;

    // 1. Direct explicit patterns (existing + new)
    if (
        REUSE_PREVIOUS_QUERY_PATTERN.test(latestMessage) ||
        CONTEXTUAL_REPLY_PATTERNS.some((p) => p.test(latestMessage)) ||
        FOLLOW_UP_PATTERNS.some((p) => p.test(latestMessage)) ||
        TEMPORAL_REPAIR_PATTERNS.some((p) => p.test(latestMessage))
    ) {
        return true;
    }

    // 2. Numeric reference detection
    const userNumbers = extractNumbers(latestMessage);
    if (userNumbers.length > 0) {
        // Look at previous assistant content for numbers
        const prevAssistantContent = getLastAssistantContent(chatMessages);
        if (prevAssistantContent) {
            const prevNumbers = extractNumbers(prevAssistantContent);
            for (const userNum of userNumbers) {
                if (
                    prevNumbers.some((prevNum) =>
                        isCloseNumber(userNum, prevNum),
                    )
                ) {
                    return true; // User is referring to a number from the previous answer
                }
            }
        }
        // Also check the previous query string (e.g., "Nvidia stock price" may not have numbers)
        const prevQueryNumbers = extractNumbers(previousQuery);
        for (const userNum of userNumbers) {
            if (
                prevQueryNumbers.some((prevNum) =>
                    isCloseNumber(userNum, prevNum),
                )
            ) {
                return true;
            }
        }
    }

    // 3. Semantic overlap (existing)
    const overlap = computeSemanticOverlap(latestMessage, previousQuery);
    const currentTokenCount = tokenize(latestMessage).length;

    // If the message is very short and contains a number, we already returned true above.
    // For very short messages without numbers, use a lower threshold if they look like a follow-up.
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

    // Standard overlap threshold (slightly lowered from 0.45 to 0.4 to catch more)
    if (overlap >= 0.4) return true;

    // 4. Additional heuristic: if the previous query is about a specific entity (e.g., stock)
    //    and the user asks to "confirm it", reuse. The pattern already catches "confirm".
    //    This is covered by CONTEXTUAL_REPLY_PATTERNS.

    return false;
};

// ------------------------------------------------------------------
// Temporal repair (unchanged)
// ------------------------------------------------------------------
const applyTemporalRepair = (previousQuery: string, currentMessage: string) => {
    const yearMatch = currentMessage.match(/\b20\d{2}\b/);
    const monthMatch = currentMessage.match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    );
    let repaired = previousQuery.replace(/\b20\d{2}\b/g, "");
    if (monthMatch) repaired += ` ${monthMatch[1]}`;
    if (yearMatch) repaired += ` ${yearMatch[0]}`;
    return repaired.replace(/\s+/g, " ").trim();
};

// ------------------------------------------------------------------
// Check if query contains a year (unchanged)
// ------------------------------------------------------------------
const queryContainsYear = (query: string) => /\b20\d{2}\b/.test(query);
const shouldAppendCurrentYear = (query: string) => {
    if (queryContainsYear(query)) return false;
    return CURRENT_YEAR_QUERY_PATTERNS.some((p) => p.test(query));
};

// ------------------------------------------------------------------
// Main exported function
// ------------------------------------------------------------------
export const normalizeQuery = (query: string) => normalizeReusableValue(query);
export const isLiveDataQuery = (query: string) =>
    LIVE_DATA_PATTERNS.some((p) => p.test(query));

export const resolveSearchQuery = (
    latestUserMessage: string,
    chatMessages: ChatMessage[],
): ResolvedSearchQuery => {
    const trimmedMessage = latestUserMessage.trim();
    const previousQuery = findPreviousResolvedQuery(
        chatMessages,
        trimmedMessage,
    );
    const reusePrevious = shouldReusePreviousContext(
        trimmedMessage,
        previousQuery,
        chatMessages,
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

// Helper (already defined above, but needed for isTemporalRepairMessage)
const isTemporalRepairMessage = (message: string) =>
    TEMPORAL_REPAIR_PATTERNS.some((p) => p.test(message));
