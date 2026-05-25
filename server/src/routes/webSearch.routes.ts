import express from "express";
import { getQuotaStatus } from "../modules/web-search/quotaStatus";

const router = express.Router();

/**
 * GET /web-search/quota-status
 * Frontend uses this to enable/disable web search UI
 */
router.get("/quota-status", async (req, res) => {
    try {
        // adjust this depending on your auth middleware
        const userId = req.headers["x-user-id"] as string;

        const status = await getQuotaStatus(userId);

        res.json({
            success: true,
            data: status,
        });
    } catch (err) {
        console.error("[web-search/quota-status]", err);

        res.status(500).json({
            success: false,
            error: "QUOTA_STATUS_FAILED",
        });
    }
});

export default router;
