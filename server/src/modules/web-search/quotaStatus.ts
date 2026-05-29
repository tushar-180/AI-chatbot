import { checkQuota, getQuotaConfig } from "./rateLimiter";
import type { QuotaUIStatus } from "../../types/quota.types";

export const getQuotaStatus = async (
    userId?: string,
): Promise<QuotaUIStatus> => {
    const result = await checkQuota(userId);

    // direct pass-through mapping (no logic duplication)
    if (!result.allowed) {
        return {
            allowed: false,
            reason: result.reason,
            scope: result.scope,
            message: result.message,
            retryAfterMs: (result as any).retryAfterMs,
        };
    }

    const config = getQuotaConfig();

    return {
        allowed: true,
        scope: "ok",
        remainingGlobal: result.remainingGlobal,
        remainingUser: result.remainingUser ?? config.maxUser,
    };
};
