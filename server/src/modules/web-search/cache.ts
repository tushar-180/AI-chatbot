import { Redis } from "@upstash/redis";
import type { SearchCandidate, WebGroundingContext } from "./webSearch.types";

const redis = Redis.fromEnv();

const key = {
    grounding: (k: string) => `grounding:${k}`,
    search: (k: string) => `search:${k}`,
    extraction: (url: string) => `extract:${url}`,
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

// ─────────────────────────────
// Generic helpers
// ─────────────────────────────

const set = async (k: string, v: any, ttlMs: number) => {
    await redis.set(k, JSON.stringify(v), { px: ttlMs });
};

const get = async <T>(k: string): Promise<T | null> => {
    const data = await redis.get<string>(k);
    return data ? (JSON.parse(data) as T) : null;
};

// ─────────────────────────────
// Grounding cache
// ─────────────────────────────

export const getGroundingCache = async (keyStr: string) => {
    return get<WebGroundingContext>(key.grounding(keyStr));
};

export const setGroundingCache = async (
    keyStr: string,
    value: WebGroundingContext,
    ttlMs: number,
) => {
    await set(key.grounding(keyStr), value, ttlMs);
};

// ─────────────────────────────
// Search cache
// ─────────────────────────────

export const getSearchCache = async (keyStr: string) => {
    return get<SearchCandidate[]>(key.search(keyStr));
};

export const setSearchCache = async (
    keyStr: string,
    value: SearchCandidate[],
    ttlMs: number,
) => {
    await set(key.search(keyStr), value, ttlMs);
};

// ─────────────────────────────
// Extraction cache
// ─────────────────────────────

export const getExtractionCache = async (url: string) => {
    return get<ExtractedPage>(key.extraction(url));
};

export const setExtractionCache = async (
    url: string,
    value: ExtractedPage,
    ttlMs: number,
) => {
    await set(key.extraction(url), value, ttlMs);
};
