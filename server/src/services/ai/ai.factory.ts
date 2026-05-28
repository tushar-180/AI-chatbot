import { IAIService } from "./ai.interface";
import { GeminiAdapter } from "./providers/gemini.adapter";
import { OpenAIAdapter } from "./providers/openai.adapter";
// import { ClaudeAdapter } from "./providers/claude.adapter";
import { NvidiaAdapter } from "./providers/nvidia.adapter";
import { AI_PROVIDERS, getDisplayProviderName } from "./constants";
import { AppConfig } from "../../models/AppConfig.model";

export class AIServiceFactory {
  private static providers: Record<string, IAIService> = {
    gemini: new GeminiAdapter(),
    openai: new OpenAIAdapter(),
    // claude: new ClaudeAdapter(),
    nvidia: new NvidiaAdapter(),
  };

  /**
   *
   * Returns available provider details (id and display name).
   * Now returns all combinations of provider and model.
   */
  public static async getAvailableProviders(): Promise<{ id: string; name: string }[]> {
    const config = await AppConfig.findOne({ singletonId: "global" }).lean();
    const disabledProviders = new Set(config?.disabledProviders || []);
    const disabledModels = new Set(config?.disabledModels || []);

    const available: { id: string; name: string }[] = [];

    Object.values(AI_PROVIDERS).forEach((p) => {
      if (disabledProviders.has(p.id)) return;

      p.models.forEach((m) => {
        const fullId = `${p.id}:${m}`;
        if (disabledModels.has(fullId)) return;

        available.push({
          id: fullId,
          name: getDisplayProviderName(p.id, m),
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
  public static getProvider(name?: string): IAIService {
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
  public static registerProvider(name: string, provider: IAIService): void {
    this.providers[name.toLowerCase()] = provider;
  }
}
