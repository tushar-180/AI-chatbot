import { AIServiceFactory } from "./ai.factory";
import { AppConfig } from "../../models/AppConfig.model";

export const aiService = {
  getAvailableProviders() {
    return AIServiceFactory.getAvailableProviders();
  },

  getProvider(provider?: string) {
    return AIServiceFactory.getProvider(provider);
  },

  async validateModelAccess(providerId?: string): Promise<void> {
    const config = await AppConfig.findOne({ singletonId: "global" }).lean();
    if (!config) return;

    const fullId = (providerId || process.env.AI_PROVIDER || "gemini").toLowerCase();
    const [providerType, _] = fullId.split(":");
    
    if (config.disabledProviders.includes(providerType)) {
      throw new Error(`Access Denied: The AI provider '${providerType}' has been disabled by the administrator.`);
    }
    
    if (config.disabledModels.includes(fullId)) {
      throw new Error(`Access Denied: The AI model '${fullId}' has been disabled by the administrator.`);
    }
  }
};
