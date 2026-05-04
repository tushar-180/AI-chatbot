import { IAIService } from "./ai.interface";
import { GeminiAdapter } from "./providers/gemini.adapter";
import { OpenAIAdapter } from "./providers/openai.adapter";
import { ClaudeAdapter } from "./providers/claude.adapter";
import { NvidiaAdapter } from "./providers/nvidia.adapter";
import { AI_PROVIDERS, getDisplayProviderName } from "./constants";

export class AIServiceFactory {
  private static providers: Record<string, IAIService> = {
    gemini: new GeminiAdapter(),
    openai: new OpenAIAdapter(),
    claude: new ClaudeAdapter(),
    nvidia: new NvidiaAdapter(),
  };

  /**
   * Returns available provider details (id and display name).
   * Now returns all combinations of provider and model.
   */
  public static getAvailableProviders(): { id: string; name: string }[] {
    const available: { id: string; name: string }[] = [];

    Object.values(AI_PROVIDERS).forEach((p) => {
      p.models.forEach((m) => {
        available.push({
          id: `${p.id}:${m}`,
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
    console.log("name", name);
    const fullId = (name || process.env.AI_PROVIDER || "gemini").toLowerCase();
    const [providerType, modelId] = fullId.split(":");

    const adapter = this.providers[providerType];

    if (!adapter) {
      console.warn(
        `Provider "${providerType}" not found. Falling back to Gemini.`,
      );
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
