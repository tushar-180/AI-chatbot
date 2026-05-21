interface CacheEntry {
    text: string;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const textCache = {
    get(key: string): string | null {
        const entry = cache.get(key);
        if (entry && entry.expiresAt > Date.now()) {
            return entry.text;
        }
        cache.delete(key);
        return null;
    },

    set(key: string, text: string, ttlMs = DEFAULT_TTL_MS): void {
        cache.set(key, {
            text,
            expiresAt: Date.now() + ttlMs,
        });
    },

    // optional: clear expired entries periodically (can be called from a setInterval)
    clean(): void {
        const now = Date.now();
        for (const [key, entry] of cache.entries()) {
            if (entry.expiresAt <= now) cache.delete(key);
        }
    },
};