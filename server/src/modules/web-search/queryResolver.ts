import type { ChatMessage } from "../../types/chat.types";
import { getNormalizationCache, setNormalizationCache } from "./cache";
import type { ResolvedSearchQuery } from "./webSearch.types";

const NORMALIZATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REUSE_PREVIOUS_QUERY_PATTERN =
  /^(search again|try again|refresh|search once more|run that again|rerun)\W*$/i;

const LIVE_DATA_PATTERNS = [
  /\b(latest|current|today|live|now|this week|this season)\b/i,
  /\b(standings|ranking|rankings|leaderboard|leaderboards|table)\b/i,
  /\b(stats|statistics|stat line|statline|score|scores|results)\b/i,
  /\b(schedule|fixtures|injury report|odds)\b/i,
  /\b(stock price|market cap|exchange rate|weather)\b/i,
];

const normalizeReusableValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(please|show me|can you|could you|would you|tell me|find|look up)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
      const resolvedQuery = readResolvedQueryFromMetadata(message.metadata);
      if (resolvedQuery) return resolvedQuery;
    }

    if (
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim() &&
      !REUSE_PREVIOUS_QUERY_PATTERN.test(message.content.trim())
    ) {
      const webSearchEnabled = Boolean(message.metadata?.webSearchEnabled);
      if (webSearchEnabled) {
        return message.content.trim();
      }
    }
  }

  return null;
};

export const normalizeQuery = (query: string) => normalizeReusableValue(query);

export const isLiveDataQuery = (query: string) =>
  LIVE_DATA_PATTERNS.some((pattern) => pattern.test(query));

export const resolveSearchQuery = (
  latestUserMessage: string,
  chatMessages: ChatMessage[],
): ResolvedSearchQuery => {
  const cached = getNormalizationCache(latestUserMessage);
  if (cached) return cached;

  const trimmedMessage = latestUserMessage.trim();
  const shouldReusePreviousQuery =
    REUSE_PREVIOUS_QUERY_PATTERN.test(trimmedMessage);
  const previousQuery = shouldReusePreviousQuery
    ? findPreviousResolvedQuery(chatMessages, latestUserMessage)
    : null;
  const resolvedQuery = previousQuery || trimmedMessage;
  const normalizedQuery = normalizeQuery(resolvedQuery);
  const liveDataQuery = isLiveDataQuery(resolvedQuery);

  const resolved: ResolvedSearchQuery = {
    rawQuery: trimmedMessage,
    resolvedQuery,
    normalizedQuery,
    cacheKey: liveDataQuery
      ? `live:${normalizedQuery}`
      : `stable:${normalizedQuery}`,
    reusedPreviousQuery: Boolean(previousQuery),
    liveDataQuery,
  };

  setNormalizationCache(
    latestUserMessage,
    resolved,
    NORMALIZATION_CACHE_TTL_MS,
  );

  return resolved;
};
