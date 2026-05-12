# Web Search Grounding Upgrade

## 1. Updated architecture

```text
Frontend Toggle
  -> Backend Orchestrator (chat.service.ts)
  -> Query Resolver
  -> Tavily Search
  -> Deduplication + Caching
  -> URL Extraction Cache
  -> LlamaIndex Retrieval + Semantic Reranking
  -> Grounded Context Builder
  -> LLM
```

`webSearchEnabled` remains the only switch that activates web search.

## 2. Required npm packages

- `llamaindex`
- `@llamaindex/openai`

Existing packages retained:

- `axios`
- `cheerio`
- `jsdom`
- `@mozilla/readability`

## 3. File-by-file refactor plan

- `server/src/services/chat.service.ts`
  - Preserve orchestration and streaming.
  - Pass message history into query resolution.
  - Persist resolved query and confidence in assistant metadata.
- `server/src/modules/web-search/webSearch.service.ts`
  - Keep Tavily entrypoint.
  - Remove manual keyword chunk scoring.
  - Add freshness-aware cached search + LlamaIndex retrieval flow.
- `server/src/modules/web-search/webSearch.types.ts`
  - Extend existing types with confidence, normalized query, and cache debug fields.
- `server/src/modules/web-search/queryResolver.ts`
  - Add `resolveSearchQuery()`
  - Add `normalizeQuery()`
  - Add `isLiveDataQuery()`
- `server/src/modules/web-search/confidence.ts`
  - Add `estimateConfidence()`
- `server/src/modules/web-search/deduplication.ts`
  - Add `deduplicateCandidates()`
- `server/src/modules/web-search/cache.ts`
  - Add normalized query cache, semantic cache, URL extraction cache, embedding cache.
- `server/src/modules/web-search/llamaindex.ts`
  - Isolate runtime loading, embeddings, retrieval, and reranking.

## 4. New utility functions

- `resolveSearchQuery(latestUserMessage, chatMessages)`
  - Reuses the previous grounded query for `search again`, `try again`, and `refresh`.
- `normalizeQuery(query)`
  - Normalizes cache keys and improves cache hit rate.
- `isLiveDataQuery(query)`
  - Detects freshness-sensitive requests.
- `estimateConfidence({ sources, liveDataQuery, cacheHit, usedSnippetFallback })`
  - Produces `low | medium | high` confidence plus reasons.
- `deduplicateCandidates(candidates, { getEmbeddings })`
  - Removes exact and semantic duplicates before extraction.

## 5. Updated retrieval pipeline

1. Check `webSearchEnabled`.
2. Resolve query from current turn plus recent conversation.
3. Read grounding cache using normalized query.
4. If cache miss, call Tavily.
5. Deduplicate search results.
6. Fetch and cache extracted page text by URL.
7. Chunk extracted text with LlamaIndex sentence splitting.
8. Build an in-memory `VectorStoreIndex`.
9. Retrieve semantically relevant chunks.
10. Rerank retrieved chunks using embedding similarity plus freshness/structured signals.
11. Collapse chunk hits back to source URLs.
12. Build the existing grounding prompt and citations block.

## 6. Example TypeScript implementation

Primary entrypoints:

- `webSearchService.buildGroundingContext()`
- `retrieveAndRerank()`
- `resolveSearchQuery()`

The implementation now keeps Tavily for discovery and uses LlamaIndex for semantic retrieval/reranking instead of manual keyword chunk ranking.

## 7. Migration strategy from current code

1. Install the two LlamaIndex packages.
2. Keep existing prompt and chat orchestration untouched.
3. Roll out the new retrieval layer behind the existing frontend toggle.
4. Monitor cache hit rate, extraction failures, and confidence labels.
5. If needed, tune TTLs and structured-domain heuristics without changing API shape.

## 8. Performance considerations

- Grounding cache avoids repeated retrieval for fresh queries.
- Search cache avoids repeated Tavily calls.
- URL extraction cache avoids repeated page downloads.
- Embedding cache reduces repeated semantic reranking cost.
- Live queries use shorter TTLs to improve freshness.
- Stable queries use longer TTLs to stay free-tier friendly.

## 9. Free-tier optimization strategy

- Prefer cache reuse before any network call.
- Normalize queries aggressively for cache hits.
- Limit Tavily depth to `basic`.
- Limit source fetch count and final citation count.
- Reuse embeddings for deduplication and reranking.
- Fall back to snippets if extraction or LlamaIndex retrieval fails.

## 10. Final recommended production structure

```text
server/src/modules/web-search/
  cache.ts
  confidence.ts
  deduplication.ts
  index.ts
  llamaindex.ts
  queryResolver.ts
  webSearch.prompts.ts
  webSearch.service.ts
  webSearch.types.ts
```

This keeps the current architecture intact while isolating retrieval concerns for future tuning.
