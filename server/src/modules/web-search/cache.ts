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

    failed?: boolean;
    fallback?: boolean;
    length?: number;
};

const set = async (k: string, v: any, ttlMs: number) => {
    await redis.set(k, JSON.stringify(v), { px: ttlMs });
};

const safeParse = <T>(value: unknown): T => {
    if (value == null) return value as T;

    if (typeof value === "string") {
        try {
            return JSON.parse(value) as T;
        } catch {
            return value as T;
        }
    }
    return value as T;
};

const get = async <T>(k: string): Promise<T | null> => {
    const data = await redis.get(k);
    return data ? safeParse<T>(data) : null;
};

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
