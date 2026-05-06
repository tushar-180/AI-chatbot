"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIServiceFactory = void 0;
const gemini_adapter_1 = require("./providers/gemini.adapter");
// import { OpenAIAdapter } from "./providers/openai.adapter";
// import { ClaudeAdapter } from "./providers/claude.adapter";
const nvidia_adapter_1 = require("./providers/nvidia.adapter");
const constants_1 = require("./constants");
class AIServiceFactory {
    static parseProviderSelection(selection) {
        const rawSelection = (selection || process.env.AI_PROVIDER || "gemini").trim();
        if (!rawSelection) {
            return { providerType: "gemini" };
        }
        const displayFormatIndex = rawSelection.indexOf(" : ");
        if (displayFormatIndex >= 0) {
            return {
                providerType: rawSelection.slice(0, displayFormatIndex).trim().toLowerCase(),
                modelId: rawSelection.slice(displayFormatIndex + 3).trim(),
            };
        }
        const separatorIndex = rawSelection.indexOf(":");
        if (separatorIndex >= 0) {
            return {
                providerType: rawSelection.slice(0, separatorIndex).trim().toLowerCase(),
                modelId: rawSelection.slice(separatorIndex + 1).trim(),
            };
        }
        return {
            providerType: rawSelection.toLowerCase(),
        };
    }
    /**
     * Returns available provider details (id and display name).
     * Now returns all combinations of provider and model.
     */
    static getAvailableProviders() {
        const available = [];
        Object.values(constants_1.AI_PROVIDERS).forEach((p) => {
            p.models.forEach((m) => {
                available.push({
                    id: `${p.id}:${m}`,
                    name: (0, constants_1.getDisplayProviderName)(p.id, m),
                });
            });
        });
        return available;
    }
    /**
     * Returns an instance of the AI Service.
     * If a name is provided, returns that specific provider.
     * Otherwise returns the default provider from environment or gemini.
     * Supports 'provider:model' format.
     */
    static getProvider(name) {
        const { providerType, modelId } = this.parseProviderSelection(name);
        const createProvider = this.providerFactories[providerType];
        if (!createProvider) {
            console.warn(`Provider "${providerType}" not found. Falling back to Gemini.`);
            return this.providerFactories["gemini"]();
        }
        const adapter = createProvider();
        if (modelId) {
            adapter.setModel(modelId);
        }
        return adapter;
    }
    /**
     * Allows adding or overriding a provider implementation.
     */
    static registerProvider(name, provider) {
        this.providerFactories[name.toLowerCase()] = () => provider;
    }
}
exports.AIServiceFactory = AIServiceFactory;
AIServiceFactory.providerFactories = {
    gemini: () => new gemini_adapter_1.GeminiAdapter(),
    // openai: () => new OpenAIAdapter(),
    // claude: () => new ClaudeAdapter(),
    nvidia: () => new nvidia_adapter_1.NvidiaAdapter(),
};
