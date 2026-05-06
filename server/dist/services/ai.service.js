"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = void 0;
const ai_factory_1 = require("./ai/ai.factory");
exports.aiService = {
    getAvailableProviders() {
        return ai_factory_1.AIServiceFactory.getAvailableProviders();
    },
    getProvider(provider) {
        return ai_factory_1.AIServiceFactory.getProvider(provider);
    },
};
