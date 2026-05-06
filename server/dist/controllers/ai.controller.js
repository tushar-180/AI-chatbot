"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableProviders = void 0;
const ai_service_1 = require("../services/ai.service");
const getAvailableProviders = (_req, res) => {
    try {
        const providers = ai_service_1.aiService.getAvailableProviders();
        return res.json({ providers });
    }
    catch (error) {
        console.error("Error fetching AI providers:", error);
        return res.status(500).json({ error: "Failed to fetch AI providers" });
    }
};
exports.getAvailableProviders = getAvailableProviders;
