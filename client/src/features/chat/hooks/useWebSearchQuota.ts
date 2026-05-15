import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/react";
import { api } from "@/lib/api";

export interface QuotaStatus {
    allowed: boolean;
    scope: "ok" | "global" | "user" | "cooldown";
    reason?:
        | "global_quota_exceeded"
        | "user_quota_exceeded"
        | "cooldown_active";
    message?: string;
    retryAfterMs?: number;
    remainingGlobal?: number;
    remainingUser?: number;
}

export const useWebSearchQuota = () => {
    const { user } = useUser();
    const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchQuotaStatus = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const res = await api.get("/web-search/quota-status", {
                headers: { "x-user-id": user.id },
            });
            if (res.data.success) setQuotaStatus(res.data.data);
        } catch (err) {
            console.error("Error fetching web search quota", err);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // Initial fetch only
    useEffect(() => {
        fetchQuotaStatus();
    }, [fetchQuotaStatus]);

    // Auto-refresh after cooldown expires
    useEffect(() => {
        if (quotaStatus?.scope === "cooldown" && quotaStatus.retryAfterMs) {
            const timer = setTimeout(() => {
                fetchQuotaStatus();
            }, quotaStatus.retryAfterMs);
            return () => clearTimeout(timer);
        }
    }, [quotaStatus, fetchQuotaStatus]);

    return { quotaStatus, isLoading, refreshQuota: fetchQuotaStatus };
};
