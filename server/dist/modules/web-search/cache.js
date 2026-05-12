"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEmbeddingCache = exports.getEmbeddingCache = exports.setNormalizationCache = exports.getNormalizationCache = exports.setExtractionCache = exports.getExtractionCache = exports.setSearchCache = exports.getSearchCache = exports.setGroundingCache = exports.getGroundingCache = void 0;
const crypto_1 = require("crypto");
const MAX_CACHE_ENTRIES = 500;
const groundingCache = new Map();
const searchCache = new Map();
const extractionCache = new Map();
const normalizationCache = new Map();
const embeddingCache = new Map();
const pruneExpiredEntries = (cache) => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
        if (entry.expiresAt <= now) {
            cache.delete(key);
        }
    }
};
const pruneOversizedCache = (cache) => {
    if (cache.size <= MAX_CACHE_ENTRIES)
        return;
    const entries = [...cache.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const removeCount = cache.size - MAX_CACHE_ENTRIES;
    for (const [key] of entries.slice(0, removeCount)) {
        cache.delete(key);
    }
};
const getCacheValue = (cache, key) => {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};
const setCacheValue = (cache, key, value, ttlMs) => {
    pruneExpiredEntries(cache);
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
        updatedAt: Date.now(),
    });
    pruneOversizedCache(cache);
};
const getGroundingCache = (key) => getCacheValue(groundingCache, key);
exports.getGroundingCache = getGroundingCache;
const setGroundingCache = (key, value, ttlMs) => setCacheValue(groundingCache, key, value, ttlMs);
exports.setGroundingCache = setGroundingCache;
const getSearchCache = (key) => getCacheValue(searchCache, key);
exports.getSearchCache = getSearchCache;
const setSearchCache = (key, value, ttlMs) => setCacheValue(searchCache, key, value, ttlMs);
exports.setSearchCache = setSearchCache;
const getExtractionCache = (url) => getCacheValue(extractionCache, url);
exports.getExtractionCache = getExtractionCache;
const setExtractionCache = (url, value, ttlMs) => setCacheValue(extractionCache, url, value, ttlMs);
exports.setExtractionCache = setExtractionCache;
const getNormalizationCache = (key) => getCacheValue(normalizationCache, key);
exports.getNormalizationCache = getNormalizationCache;
const setNormalizationCache = (key, value, ttlMs) => setCacheValue(normalizationCache, key, value, ttlMs);
exports.setNormalizationCache = setNormalizationCache;
const getEmbeddingCache = (text) => {
    const key = (0, crypto_1.createHash)("sha1").update(text).digest("hex");
    return getCacheValue(embeddingCache, key);
};
exports.getEmbeddingCache = getEmbeddingCache;
const setEmbeddingCache = (text, value, ttlMs) => {
    const key = (0, crypto_1.createHash)("sha1").update(text).digest("hex");
    setCacheValue(embeddingCache, key, value, ttlMs);
};
exports.setEmbeddingCache = setEmbeddingCache;
