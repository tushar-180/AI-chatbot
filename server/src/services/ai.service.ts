import { AIServiceFactory } from "./ai/ai.factory";

export const aiService = {
  getAvailableProviders() {
    return AIServiceFactory.getAvailableProviders();
  },

  getProvider(provider?: string) {
    return AIServiceFactory.getProvider(provider);
  },
};
