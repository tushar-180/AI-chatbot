import { checkQuota, getQuotaConfig } from "./rateLimiter";

export type QuotaUIStatus =
    | {
          allowed: false;
          reason:
              | "global_quota_exceeded"
              | "user_quota_exceeded"
              | "cooldown_active"
              | "monthly_credits_exhausted";
          scope: "global" | "user" | "cooldown" | "monthly";
          message: string;
          retryAfterMs?: number;
      }
    | {
          allowed: true;
          scope: "ok";
          remainingGlobal: number;
          remainingUser?: number;
      };

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
