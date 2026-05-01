"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIServiceFactory = void 0;
const gemini_adapter_1 = require("./providers/gemini.adapter");
const openai_adapter_1 = require("./providers/openai.adapter");
const claude_adapter_1 = require("./providers/claude.adapter");
const nvidia_adapter_1 = require("./providers/nvidia.adapter");
const constants_1 = require("./constants");
class AIServiceFactory {
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
        console.log("name", name);
        const fullId = (name || process.env.AI_PROVIDER || "gemini").toLowerCase();
        const [providerType, modelId] = fullId.split(":");
        const adapter = this.providers[providerType];
        if (!adapter) {
            console.warn(`Provider "${providerType}" not found. Falling back to Gemini.`);
            return this.providers["gemini"];
        }
        if (modelId) {
            adapter.setModel(modelId);
        }
        return adapter;
    }
    /**
     * Allows adding or overriding a provider implementation.
     */
    static registerProvider(name, provider) {
        this.providers[name.toLowerCase()] = provider;
    }
}
exports.AIServiceFactory = AIServiceFactory;
AIServiceFactory.providers = {
    gemini: new gemini_adapter_1.GeminiAdapter(),
    openai: new openai_adapter_1.OpenAIAdapter(),
    claude: new claude_adapter_1.ClaudeAdapter(),
    nvidia: new nvidia_adapter_1.NvidiaAdapter(),
};
