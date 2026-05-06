"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsVision = exports.getDisplayProviderName = exports.AI_PROVIDERS = void 0;
exports.AI_PROVIDERS = {
    GEMINI: {
        id: "gemini",
        models: [
            "gemini-3.1-flash-lite-preview",
            "gemini-2.0-flash",
            "gemini-2.5-flash-lite",
        ],
        visionModels: [
            "gemini-2.0-flash",
            "gemini-3.1-flash-lite-preview"
        ]
    },
    NVIDIA: {
        id: "nvidia",
        models: [
            "nvidia/nemotron-3-super-120b-a12b",
            "moonshotai/kimi-k2-instruct",
            "openai/gpt-oss-120b",
            "black-forest-labs/flux.2-klein-4b"
        ],
        visionModels: [
            "black-forest-labs/flux.2-klein-4b" // For image gen, but could be extended
        ]
    },
};
const getDisplayProviderName = (providerId, modelName) => {
    const modelShortName = modelName.split("/").pop() || modelName;
    return `${providerId} : ${modelShortName}`;
};
exports.getDisplayProviderName = getDisplayProviderName;
/**
 * Helper to check if a model supports vision/multimedia input
 */
const supportsVision = (modelId) => {
    // Common keywords for vision models
    const visionKeywords = ['flash', 'vision', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5'];
    if (visionKeywords.some(kw => modelId.toLowerCase().includes(kw))) {
        return true;
    }
    // Explicit check against our config
    return Object.values(exports.AI_PROVIDERS).some(p => { var _a; return (_a = p.visionModels) === null || _a === void 0 ? void 0 : _a.includes(modelId); });
};
exports.supportsVision = supportsVision;
