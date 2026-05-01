import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import { AI_PROVIDERS, getDisplayProviderName } from "../constants";

/**
 * Placeholder for OpenAI implementation.
 * In a real scenario, you would install 'openai' and use it here.
 */
export class OpenAIAdapter implements IAIService {
  private model: string = AI_PROVIDERS.OPENAI.models[0];

  getProviderName(): string {
    return getDisplayProviderName(AI_PROVIDERS.OPENAI.id, this.model);
  }

  setModel(model: string): void {
    this.model = model;
  }

  async generateResponse(messages: AIMessage[]): Promise<string> {
    console.log("OpenAI Adapter: Generating response (Mock)");
    return "OpenAI support is currently in placeholder mode. Please implement the OpenAI SDK integration in openai.adapter.ts.";
  }

  async *generateStreamResponse(messages: AIMessage[]): AsyncIterable<string> {
    console.log("OpenAI Adapter: Generating stream response (Mock)");
    const mockText = "OpenAI streaming support is currently in placeholder mode.";
    for (const word of mockText.split(" ")) {
      yield word + " ";
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
