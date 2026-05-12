"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSearchQuery = exports.isLiveDataQuery = exports.normalizeQuery = void 0;
const cache_1 = require("./cache");
const NORMALIZATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REUSE_PREVIOUS_QUERY_PATTERN = /^(search again|try again|refresh|search once more|run that again|rerun)\W*$/i;
const LIVE_DATA_PATTERNS = [
    /\b(latest|current|today|live|now|this week|this season)\b/i,
    /\b(standings|ranking|rankings|leaderboard|leaderboards|table)\b/i,
    /\b(stats|statistics|stat line|statline|score|scores|results)\b/i,
    /\b(schedule|fixtures|injury report|odds)\b/i,
    /\b(stock price|market cap|exchange rate|weather)\b/i,
];
const normalizeReusableValue = (value) => value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(please|show me|can you|could you|would you|tell me|find|look up)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const readResolvedQueryFromMetadata = (metadata) => {
    const resolvedQuery = metadata === null || metadata === void 0 ? void 0 : metadata.resolvedQuery;
    if (typeof resolvedQuery === "string" && resolvedQuery.trim()) {
        return resolvedQuery.trim();
    }
    const query = metadata === null || metadata === void 0 ? void 0 : metadata.query;
    if (typeof query === "string" && query.trim()) {
        return query.trim();
    }
    return null;
};
const findPreviousResolvedQuery = (chatMessages, latestUserMessage) => {
    var _a;
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
        const message = chatMessages[index];
        if (message.role === "user" &&
            message.content.trim() === latestUserMessage.trim() &&
            index === chatMessages.length - 1) {
            continue;
        }
        if (message.role === "assistant") {
            const resolvedQuery = readResolvedQueryFromMetadata(message.metadata);
            if (resolvedQuery)
                return resolvedQuery;
        }
        if (message.role === "user" &&
            typeof message.content === "string" &&
            message.content.trim() &&
            !REUSE_PREVIOUS_QUERY_PATTERN.test(message.content.trim())) {
            const webSearchEnabled = Boolean((_a = message.metadata) === null || _a === void 0 ? void 0 : _a.webSearchEnabled);
            if (webSearchEnabled) {
                return message.content.trim();
            }
        }
    }
    return null;
};
const normalizeQuery = (query) => normalizeReusableValue(query);
exports.normalizeQuery = normalizeQuery;
const isLiveDataQuery = (query) => LIVE_DATA_PATTERNS.some((pattern) => pattern.test(query));
exports.isLiveDataQuery = isLiveDataQuery;
const resolveSearchQuery = (latestUserMessage, chatMessages) => {
    const cached = (0, cache_1.getNormalizationCache)(latestUserMessage);
    if (cached)
        return cached;
    const trimmedMessage = latestUserMessage.trim();
    const shouldReusePreviousQuery = REUSE_PREVIOUS_QUERY_PATTERN.test(trimmedMessage);
    const previousQuery = shouldReusePreviousQuery
        ? findPreviousResolvedQuery(chatMessages, latestUserMessage)
        : null;
    const resolvedQuery = previousQuery || trimmedMessage;
    const normalizedQuery = (0, exports.normalizeQuery)(resolvedQuery);
    const liveDataQuery = (0, exports.isLiveDataQuery)(resolvedQuery);
    const resolved = {
        rawQuery: trimmedMessage,
        resolvedQuery,
        normalizedQuery,
        cacheKey: liveDataQuery
            ? `live:${normalizedQuery}`
            : `stable:${normalizedQuery}`,
        reusedPreviousQuery: Boolean(previousQuery),
        liveDataQuery,
    };
    (0, cache_1.setNormalizationCache)(latestUserMessage, resolved, NORMALIZATION_CACHE_TTL_MS);
    return resolved;
};
exports.resolveSearchQuery = resolveSearchQuery;
