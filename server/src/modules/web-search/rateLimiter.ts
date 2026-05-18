import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// ─────────────────────────────
// Time helpers
// ─────────────────────────────
const getISTDayKey = () => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    return `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;
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
    global: () => `web_search:global:daily:${getISTDayKey()}`,
    user: (id: string) => `web_search:user:daily:${id}:${getISTDayKey()}`,
    cooldown: (id: string) => `web_search:cooldown:${id}`,
};

// ─────────────────────────────
// Tavily usage helper
// ─────────────────────────────
const getTavilyUsage = async (apiKey: string): Promise<{ usage: number; limit: number } | null> => {
    const cacheKey = "web_search:tavily:usage_cache";
    try {
        const cached = await redis.get<{ usage: number; limit: number }>(cacheKey);
        if (cached) return cached;
    } catch (err) {
        console.warn("[web-search] Failed to read Tavily usage cache from Redis:", err);
    }

    try {
        const response = await fetch("https://api.tavily.com/usage", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
        });
        if (!response.ok) return null;
        const data = await response.json() as any;
        const keyData = data?.key;
        if (keyData && typeof keyData.usage === "number" && typeof keyData.limit === "number") {
            const usageLimit = {
                usage: keyData.usage,
                limit: keyData.limit,
            };
            await redis.set(cacheKey, usageLimit, { ex: 60 });
            return usageLimit;
        }
        return null;
    } catch (err) {
        console.error("[web-search] Failed to fetch Tavily usage:", err);
        return null;
    }
};

export const checkQuota = async (userId?: string) => {
    // Tavily monthly limit check
    const apiKey = process.env.TAVILY_API_KEY;
    if (apiKey) {
        const usageLimit = await getTavilyUsage(apiKey);
        if (usageLimit) {
            const remaining = usageLimit.limit - usageLimit.usage;
            if (remaining <= 50) {
                console.warn(`[web-search] WARNING: Only ${remaining} Tavily search credits remaining!`);
            }
            if (remaining <= 0) {
                return {
                    allowed: false as const,
                    reason: "monthly_credits_exhausted" as const,
                    message: "Monthly Tavily search credits exhausted",
                    scope: "monthly" as const,
                };
            }
        }
    }

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

const secondsUntilMidnight = () => {
    const now = new Date();
    
    // IST is UTC+5:30 (330 minutes)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
    
    const midnightIST = new Date(Date.UTC(
        nowIST.getUTCFullYear(),
        nowIST.getUTCMonth(),
        nowIST.getUTCDate() + 1
    ) - IST_OFFSET_MS);
    
    return Math.max(1, Math.floor((midnightIST.getTime() - now.getTime()) / 1000));
};
export const recordSearch = async (userId?: string) => {
    const ttl = secondsUntilMidnight();

    // Step 1: Increment the daily counters
    const incrPipeline = redis.pipeline();
    incrPipeline.incr(k.global());
    if (userId) incrPipeline.incr(k.user(userId));

    let globalCount: number | undefined;
    let userCount: number | undefined;

    try {
        const results = await incrPipeline.exec();
        // Upstash pipeline exec() returns an array of command results in order
        globalCount = results[0] as number;
        if (userId) {
            userCount = results[1] as number;
        }
    } catch (err) {
        console.error('[web-search] Failed to record search usage (increment):', err);
        return; // stop – we couldn't update the counters
    }

    // Step 2: Set expiry only if the counter was just created (i.e. = 1)
    const expirePipeline = redis.pipeline();
    let expireNeeded = false;

    if (globalCount === 1) {
        expirePipeline.expire(k.global(), ttl);
        expireNeeded = true;
    }
    if (userId && userCount === 1) {
        expirePipeline.expire(k.user(userId), ttl);
        expireNeeded = true;
    }

    if (expireNeeded) {
        try {
            await expirePipeline.exec();
        } catch (err) {
            console.error('[web-search] Failed to set expiry on search counters:', err);
            // The counters are already incremented; expiry may be applied
            // by a future request or a default Redis TTL if configured.
        }
    }
};

export const setCooldown = async (userId: string) => {
    if (!userId) return;

    await redis.set(k.cooldown(userId), Date.now(), {
        px: COOLDOWN_MS(),
    });
};

export const getQuotaConfig = () => ({
    maxGlobal: MAX_GLOBAL(),
    maxUser: MAX_USER(),
    cooldownMs: COOLDOWN_MS(),
});
