import OpenAI from "openai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import {
  AI_PROVIDERS,
  getDisplayProviderName,
  supportsVision,
} from "../constants";

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

  private formatMessages(messages: AIMessage[]) {
    const isVision = supportsVision(this.model);

    return messages.map((m) => {
      let content: any = m.content;

      // If there are attachments and the model doesn't support vision, append them as text
      if (m.attachments && m.attachments.length > 0) {
        if (!isVision) {
          const attachmentText = m.attachments
            .map((a) => `\n[Image: ${a.url}]`)
            .join("");
          content += attachmentText;
        } else {
          // Format for multimodal models (OpenAI style)
          content = [
            { type: "text", text: m.content },
            ...m.attachments.map((a) => ({
              type: "image_url",
              image_url: { url: a.url },
            })),
          ];
        }
      }

      return {
        role: m.role as any,
        content,
      };
    });
  }

  async generateResponse(messages: AIMessage[]): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: this.formatMessages(messages),
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

  async *generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    try {
      const stream = await this.openai.chat.completions.create(
        {
          model: this.model,
          messages: this.formatMessages(messages),
          temperature: 0.6,
          top_p: 0.7,
          max_tokens: 4096,
          stream: true,
        },
        {
          signal,
        },
      );

      for await (const chunk of stream) {
        if (signal?.aborted) {
          return;
        }
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

  async generateEmbedding(text: string): Promise<number[]> {
    // NVIDIA NIM supports embeddings, but we'd need to use a specific embedding model
    // For now, returning empty array as a stub
    return [];
  }
}
