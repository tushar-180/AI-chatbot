import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// ─────────────────────────────
// Time helpers
// ─────────────────────────────

const getUtcDayKey = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
};

// ─────────────────────────────
// Config
// ─────────────────────────────

const MAX_GLOBAL = () => Number(process.env.MAX_DAILY_SEARCHES) || 40;
const MAX_USER = () => Number(process.env.USER_DAILY_QUOTA) || 15;
const COOLDOWN_MS = () => Number(process.env.WEB_SEARCH_COOLDOWN_MS) || 30_000;

// ─────────────────────────────
// Redis keys
// ─────────────────────────────

const k = {
    global: () => `web_search:global:daily:${getUtcDayKey()}`,
    user: (id: string) => `web_search:user:daily:${id}:${getUtcDayKey()}`,
    cooldown: (id: string) => `web_search:cooldown:${id}`,
};

// ─────────────────────────────
// Check quota (single source of truth)
// ─────────────────────────────

export const checkQuota = async (userId?: string) => {
    const maxGlobal = MAX_GLOBAL();
    const maxUser = MAX_USER();

    const globalUsed = Number((await redis.get(k.global())) || 0);

    // GLOBAL LIMIT
    if (globalUsed >= maxGlobal) {
        return {
            allowed: false as const,
            reason: "global_quota_exceeded" as const,
            message: `Daily global search limit reached (${maxGlobal})`,
            scope: "global" as const,
        };
    }

    // USER LIMIT
    if (userId) {
        const userUsed = Number((await redis.get(k.user(userId))) || 0);

        if (userUsed >= maxUser) {
            return {
                allowed: false as const,
                reason: "user_quota_exceeded" as const,
                message: `Daily user search limit reached (${maxUser})`,
                scope: "user" as const,
            };
        }

        // COOLDOWN (read-only check here)
        const last = await redis.get<number>(k.cooldown(userId));

        if (last) {
            const elapsed = Date.now() - last;

            if (elapsed < COOLDOWN_MS()) {
                return {
                    allowed: false as const,
                    reason: "cooldown_active" as const,
                    message: "Cooldown active",
                    scope: "cooldown" as const,
                    retryAfterMs: COOLDOWN_MS() - elapsed,
                };
            }
        }
    }

    return {
        allowed: true as const,
        scope: "ok" as const,
        remainingGlobal: maxGlobal - globalUsed,
        remainingUser: userId
            ? maxUser - Number((await redis.get(k.user(userId))) || 0)
            : undefined,
    };
};

// ─────────────────────────────
// Record usage (atomic via pipeline)
// ─────────────────────────────

export const recordSearch = async (userId?: string) => {
    const ttl = 60 * 60 * 24;

    const pipeline = redis.pipeline();

    // global counter
    pipeline.incr(k.global());
    pipeline.expire(k.global(), ttl);

    // user counter
    if (userId) {
        pipeline.incr(k.user(userId));
        pipeline.expire(k.user(userId), ttl);
    }

    await pipeline.exec();
};

// ─────────────────────────────
// Cooldown setter (MUST be called AFTER successful search)
// ─────────────────────────────

export const setCooldown = async (userId: string) => {
    if (!userId) return;

    await redis.set(k.cooldown(userId), Date.now(), {
        px: COOLDOWN_MS(),
    });
};

// ─────────────────────────────
// Config helpers (optional use in UI layer)
// ─────────────────────────────

export const getQuotaConfig = () => ({
    maxGlobal: MAX_GLOBAL(),
    maxUser: MAX_USER(),
    cooldownMs: COOLDOWN_MS(),
});
