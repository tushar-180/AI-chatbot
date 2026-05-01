import OpenAI from "openai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import { AI_PROVIDERS, getDisplayProviderName } from "../constants";

export class NvidiaAdapter implements IAIService {
  private openai: OpenAI;
  private model: string = AI_PROVIDERS.NVIDIA.models[0];

  constructor() {
    const apiKey = process.env.NVIDIA_API_KEY;
    const baseURL =
      process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

    if (!apiKey) {
      console.error("NVIDIA_API_KEY is not defined in environment variables");
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    });
  }

  getProviderName(): string {
    return getDisplayProviderName(AI_PROVIDERS.NVIDIA.id, this.model);
  }

  setModel(model: string): void {
    this.model = model;
  }

  async generateResponse(messages: AIMessage[]): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role as any,
          content: m.content,
        })),
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 4096,
      });

      return completion.choices[0]?.message?.content || "";
    } catch (error: any) {
      console.error("NVIDIA generateResponse error:", error);
      throw new AIServiceError(
        error.message || "Failed to generate response from NVIDIA NIM",
        error.status,
      );
    }
  }

  async *generateStreamResponse(messages: AIMessage[]): AsyncIterable<string> {
    try {
      const stream = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role as any,
          content: m.content,
        })),
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      console.error("NVIDIA generateStreamResponse error:", error);
      throw new AIServiceError(
        error.message || "Failed to generate stream response from NVIDIA NIM",
        error.status,
      );
    }
  }
}
