import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const getUtcDayKey = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
};

const MAX_GLOBAL = () => Number(process.env.MAX_DAILY_SEARCHES) || 40;
const MAX_USER = () => Number(process.env.USER_DAILY_QUOTA) || 15;
const COOLDOWN_MS = () => Number(process.env.WEB_SEARCH_COOLDOWN_MS) || 30_000;

const k = {
    global: () => `quota:global:${getUtcDayKey()}`,
    user: (id: string) => `quota:user:${id}:${getUtcDayKey()}`,
    cooldown: (id: string) => `quota:cooldown:${id}`,
};

// ─────────────────────────────
// Check quota
// ─────────────────────────────

export const checkQuota = async (userId?: string) => {
    const maxGlobal = MAX_GLOBAL();
    const maxUser = MAX_USER();

    // GLOBAL
    const globalUsed = Number((await redis.get(k.global())) || 0);

    if (globalUsed >= maxGlobal) {
        console.log("Global rate limit exceeded");
        return {
            allowed: false as const,
            reason: "GLOBAL_DAILY_LIMIT_EXCEEDED" as const,
            message: `Daily search limit reached (${maxGlobal})`,
        };
    }

    // USER
    if (userId) {
        const userUsed = Number((await redis.get(k.user(userId))) || 0);

        if (userUsed >= maxUser) {
            console.log("USER ID: ", userId, " Rate limit exceeded");
            return {
                allowed: false as const,
                reason: "DAILY_USER_LIMIT_EXCEEDED" as const,
                message: `Daily user limit reached (${maxUser})`,
            };
        }

        // cooldown
        const last = await redis.get<number>(k.cooldown(userId));

        if (last) {
            const elapsed = Date.now() - last;
            if (elapsed < COOLDOWN_MS()) {
                return {
                    allowed: false as const,
                    reason: "USER_COOLDOWN_ACTIVE" as const,
                    message: `Cooldown active`,
                    retryAfterMs: COOLDOWN_MS() - elapsed,
                };
            }
        }
    }

    return { allowed: true as const };
};

// ─────────────────────────────
// Record usage (atomic)
// ─────────────────────────────

export const recordSearch = async (userId?: string) => {
    const ttl = 60 * 60 * 24; // 1 day fallback TTL safety

    await redis.incr(k.global());
    await redis.expire(k.global(), ttl);

    if (userId) {
        await redis.incr(k.user(userId));
        await redis.expire(k.user(userId), ttl);

        await redis.set(k.cooldown(userId), Date.now(), {
            px: COOLDOWN_MS(),
        });
    }
};
