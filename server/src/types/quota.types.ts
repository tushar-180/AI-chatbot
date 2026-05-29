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
