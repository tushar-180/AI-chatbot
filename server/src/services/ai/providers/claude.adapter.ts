import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import { AI_PROVIDERS, getDisplayProviderName } from "../constants";

/**
 * Placeholder for Claude (Anthropic) implementation.
 * To use this, install '@anthropic-ai/sdk' and configure ANTHROPIC_API_KEY.
 */
export class ClaudeAdapter implements IAIService {
  private model: string = AI_PROVIDERS.CLAUDE.models[0];

  getProviderName(): string {
    return getDisplayProviderName(AI_PROVIDERS.CLAUDE.id, this.model);
  }

  setModel(model: string): void {
    this.model = model;
  }

  async generateResponse(messages: AIMessage[]): Promise<string> {
    console.log("Claude Adapter: Generating response (Mock)");
    return "Claude support is currently in placeholder mode. Please install the '@anthropic-ai/sdk' and implement the logic in claude.adapter.ts.";
  }

  async *generateStreamResponse(messages: AIMessage[]): AsyncIterable<string> {
    console.log("Claude Adapter: Generating stream response (Mock)");
    const mockText = "Claude (Anthropic) streaming support is currently in placeholder mode. Follow the instructions in the code to enable full integration.";
    
    for (const word of mockText.split(" ")) {
      yield word + " ";
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
}
