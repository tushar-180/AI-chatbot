import { createHash } from "crypto";
import type {
  ResolvedSearchQuery,
  SearchCandidate,
  WebGroundingContext,
} from "./webSearch.types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  updatedAt: number;
};

export type ExtractedPage = {
  title: string;
  url: string;
  hostname: string;
  snippet: string;
  text: string;
  publishedAt?: string | null;
  lastModified?: string | null;
  fetchedAt: number;
};

const MAX_CACHE_ENTRIES = 500;

const groundingCache = new Map<string, CacheEntry<WebGroundingContext>>();
const searchCache = new Map<string, CacheEntry<SearchCandidate[]>>();
const extractionCache = new Map<string, CacheEntry<ExtractedPage>>();
const normalizationCache = new Map<string, CacheEntry<ResolvedSearchQuery>>();
const embeddingCache = new Map<string, CacheEntry<number[]>>();

const pruneExpiredEntries = <T>(cache: Map<string, CacheEntry<T>>) => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
};

const pruneOversizedCache = <T>(cache: Map<string, CacheEntry<T>>) => {
  if (cache.size <= MAX_CACHE_ENTRIES) return;

  const entries = [...cache.entries()].sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt,
  );
  const removeCount = cache.size - MAX_CACHE_ENTRIES;
  for (const [key] of entries.slice(0, removeCount)) {
    cache.delete(key);
  }
};

const getCacheValue = <T>(cache: Map<string, CacheEntry<T>>, key: string) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCacheValue = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) => {
  pruneExpiredEntries(cache);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    updatedAt: Date.now(),
  });
  pruneOversizedCache(cache);
};

export const getGroundingCache = (key: string) =>
  getCacheValue(groundingCache, key);

export const setGroundingCache = (
  key: string,
  value: WebGroundingContext,
  ttlMs: number,
) => setCacheValue(groundingCache, key, value, ttlMs);

export const getSearchCache = (key: string) => getCacheValue(searchCache, key);

export const setSearchCache = (
  key: string,
  value: SearchCandidate[],
  ttlMs: number,
) => setCacheValue(searchCache, key, value, ttlMs);

export const getExtractionCache = (url: string) =>
  getCacheValue(extractionCache, url);

export const setExtractionCache = (
  url: string,
  value: ExtractedPage,
  ttlMs: number,
) => setCacheValue(extractionCache, url, value, ttlMs);

export const getNormalizationCache = (key: string) =>
  getCacheValue(normalizationCache, key);

export const setNormalizationCache = (
  key: string,
  value: ResolvedSearchQuery,
  ttlMs: number,
) => setCacheValue(normalizationCache, key, value, ttlMs);

export const getEmbeddingCache = (text: string) => {
  const key = createHash("sha1").update(text).digest("hex");
  return getCacheValue(embeddingCache, key);
};

export const setEmbeddingCache = (
  text: string,
  value: number[],
  ttlMs: number,
) => {
  const key = createHash("sha1").update(text).digest("hex");
  setCacheValue(embeddingCache, key, value, ttlMs);
};
