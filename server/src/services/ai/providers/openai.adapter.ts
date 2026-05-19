import { OpenAI } from "openai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError, AIStreamResponse } from "../types";
import {
  AI_PROVIDERS,
  getDisplayProviderName,
  supportsVision,
} from "../constants";
import { normalizeOpenAIUsage } from "../../../utils/tokenCounter";
import dotenv from "dotenv";

dotenv.config();

export class OpenAIAdapter implements IAIService {
  private openai: OpenAI;
  private model: string;
  private static imageCache = new Map<string, string>();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIServiceError("OpenAI API key missing", 500);
    }
    this.openai = new OpenAI({ apiKey });
    this.model = AI_PROVIDERS.OPENAI.models[0];
  }

  getProviderName(): string {
    return getDisplayProviderName(AI_PROVIDERS.OPENAI.id, this.model);
  }

  setModel(model: string): void {
    this.model = model;
  }

  private async formatMessages(messages: AIMessage[]) {
    const isVision = supportsVision(this.model);

    return Promise.all(
      messages.map(async (msg) => {
        const role =
          msg.role === "system"
            ? "developer"
            : msg.role === "assistant"
            ? "assistant"
            : "user";

        if (msg.attachments && msg.attachments.length > 0 && isVision) {
          const contentParts: any[] = [
            { type: "input_text", text: msg.content || "" },
          ];

          for (const att of msg.attachments) {
            try {
              let imageUrl = att.url;

              if (att.url.startsWith("http")) {
                if (OpenAIAdapter.imageCache.has(att.url)) {
                  imageUrl = OpenAIAdapter.imageCache.get(att.url)!;
                } else {
                  const res = await fetch(att.url);
                  if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    const base64Data =
                      Buffer.from(arrayBuffer).toString("base64");
                    const mimeType =
                      att.mimeType ||
                      res.headers.get("content-type") ||
                      "image/jpeg";
                    imageUrl = `data:${mimeType};base64,${base64Data}`;
                    OpenAIAdapter.imageCache.set(att.url, imageUrl);
                  }
                }
              }

              contentParts.push({
                type: "input_image",
                image_url: imageUrl,
              });
            } catch (err) {
              console.error(`Failed to process image for OpenAI: ${att.url}`, err);
            }
          }

          return { role, content: contentParts };
        }

        return {
          role,
          content: msg.content || "",
        };
      }),
    );
  }

  private getSystemInstruction(combinedSystemPrompt?: string): string {
    const coreInstructions = `You are Velora, a powerful and sophisticated AI assistant.

OUTPUT RULES (STRICTLY ENFORCED):
1. Always format responses using clean, professional Markdown.
2. For code: ALWAYS use triple backticks with the correct language; NEVER return raw code without code blocks.
3. For images & visual content: You MUST embed images directly using Markdown \`![description](url)\` or HTML \`<img src="url">\`. ONLY use absolute public URLs starting with http:// or https://. NEVER use internal/local paths (e.g., "/v1/AUTH_mw/...") or relative paths. NEVER say "I cannot show images". YOU CAN. If your context contains a valid image URL, you are REQUIRED to display it visually.
4. Structure: Use clear headings, bullet points, and consistent spacing.`;

    return combinedSystemPrompt
      ? `${combinedSystemPrompt}\n\n---\n\n${coreInstructions}`
      : coreInstructions;
  }

  async generateResponse(messages: AIMessage[]) {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    const formattedInput = await this.formatMessages(
      messages.filter((msg) => msg.role !== "system"),
    );

    try {
      // Add developer instructions at the beginning of the turn
      const developerMessage = {
        role: "developer" as const,
        content: this.getSystemInstruction(combinedSystemPrompt),
      };

      const response = await this.openai.responses.create({
        model: this.model,
        input: [developerMessage, ...formattedInput] as any,
      });

      return {
        text: response.output_text?.trim() || "No response generated.",
        usage: normalizeOpenAIUsage((response as any).usage),
      };
    } catch (error: any) {
      console.error("OpenAI Adapter Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): Promise<AIStreamResponse> {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    const formattedInput = await this.formatMessages(
      messages.filter((msg) => msg.role !== "system"),
    );

    try {
      const developerMessage = {
        role: "developer" as const,
        content: this.getSystemInstruction(combinedSystemPrompt),
      };

      const stream = (await this.openai.responses.create({
        model: this.model,
        input: [developerMessage, ...formattedInput] as any,
        stream: true,
      })) as any;

      let latestUsage: ReturnType<typeof normalizeOpenAIUsage>;
      let settleUsage: (usage: ReturnType<typeof normalizeOpenAIUsage>) => void =
        () => undefined;
      let usageSettled = false;
      const usage = new Promise<ReturnType<typeof normalizeOpenAIUsage>>(
        (resolve) => {
          settleUsage = (value) => {
            if (!usageSettled) {
              usageSettled = true;
              resolve(value);
            }
          };
        },
      );

      return {
        usage,
        async *[Symbol.asyncIterator]() {
          try {
            for await (const chunk of stream) {
              if (signal?.aborted) {
                return;
              }

              let text = "";

              if (chunk.data?.event?.type === "response.output_text.delta") {
                text = chunk.data.event.delta;
              } else if (chunk.type === "response.output_text.delta") {
                text = chunk.delta || chunk.text;
              } else if (chunk.choices?.[0]?.delta?.content) {
                text = chunk.choices[0].delta.content;
              } else if (chunk.text) {
                text = chunk.text;
              }

              const usageChunk =
                chunk.response?.usage ??
                chunk.data?.event?.response?.usage ??
                chunk.usage;
              const normalizedUsage = normalizeOpenAIUsage(usageChunk);
              if (normalizedUsage) {
                latestUsage = normalizedUsage;
              }

              if (text) {
                yield text;
              }
            }
          } finally {
            settleUsage(latestUsage);
          }
        },
      };
    } catch (error: any) {
      if (signal?.aborted) {
        return {
          usage: Promise.resolve(undefined),
          async *[Symbol.asyncIterator]() {},
        };
      }
      console.error("OpenAI Adapter Stream Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      return response.data?.[0]?.embedding || [];
    } catch (error: any) {
      console.error("OpenAI Embedding Error:", error);
      return [];
    }
  }
  
}
