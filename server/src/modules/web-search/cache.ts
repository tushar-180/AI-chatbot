// cache.ts – corrected compression for Upstash REST API
import { Redis } from "@upstash/redis";
import { deflate, inflate } from "zlib";
import { promisify } from "util";
import type { SearchCandidate, WebGroundingContext } from "./webSearch.types";

const redis = Redis.fromEnv();

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

const key = {
    grounding: (k: string) => `grounding:${k}`,
    search: (k: string) => `search:${k}`,
};

// ── Compression helpers (base64‑safe) ────────────────────────
const compress = async (data: any): Promise<string> => {
    const json = JSON.stringify(data);
    const buf = await deflateAsync(Buffer.from(json));
    return buf.toString("base64"); // ← store as base64 string
};

const decompress = async <T>(encoded: string): Promise<T> => {
    const buf = Buffer.from(encoded, "base64");
    const inflated = await inflateAsync(buf);
    return JSON.parse(inflated.toString()) as T;
};

// ── Core set/get with compression ───────────────────────────
const set = async (k: string, v: any, ttlMs: number) => {
    const compressed = await compress(v);
    await redis.set(k, compressed, { px: ttlMs });
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
    if (!data) return null;

    // 1. If it's a base64 string (compressed), decompress it
    if (typeof data === "string") {
        try {
            // Attempt decompress; if it fails, fall through to safeParse
            return await decompress<T>(data);
        } catch {
            // Might be old uncompressed JSON
        }
    }

    // 2. Fallback for legacy uncompressed data (plain JSON string)
    return safeParse<T>(data);
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

// ── Last search pointer (small, no compression needed) ──────
const LAST_SEARCH_TTL_MS = 30 * 60 * 1000;

const setRaw = async (k: string, v: any, ttlMs: number) => {
    await redis.set(k, JSON.stringify(v), { px: ttlMs });
};

const getRaw = async <T>(k: string): Promise<T | null> => {
    const data = await redis.get(k);
    return data ? safeParse<T>(data) : null;
};

export const setLastSearchPointer = async (
    userId: string,
    context: {
        resolvedQuery: string;
        cacheKey: string;
        liveDataQuery: boolean;
    },
) => {
    await setRaw(`session:last_search:${userId}`, context, LAST_SEARCH_TTL_MS);
};

export const getLastSearchPointer = async (userId: string) => {
    return getRaw<{
        resolvedQuery: string;
        cacheKey: string;
        liveDataQuery: boolean;
    }>(`session:last_search:${userId}`);
};
