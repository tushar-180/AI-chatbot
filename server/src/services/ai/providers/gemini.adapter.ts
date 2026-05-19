import { GoogleGenAI } from "@google/genai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError, AIStreamResponse } from "../types";
import {
  AI_PROVIDERS,
  getDisplayProviderName,
  supportsVision,
} from "../constants";
import { normalizeGeminiUsageMetadata } from "../../../utils/tokenCounter";
import dotenv from "dotenv";

dotenv.config();

export class GeminiAdapter implements IAIService {
  private ai: GoogleGenAI;
  private model: string;
  private static imageCache = new Map<
    string,
    { data: string; mimeType: string }
  >();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIServiceError("Gemini API key missing", 500);
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = AI_PROVIDERS.GEMINI.models[0];
  }

  getProviderName(): string {
    return getDisplayProviderName(AI_PROVIDERS.GEMINI.id, this.model);
  }

  setModel(model: string): void {
    this.model = model;
  }

  private async formatContents(messages: AIMessage[]) {
    const isVision = supportsVision(this.model);

    return Promise.all(
      messages
        .filter((msg) => msg.role !== "system")
        .map(async (msg) => {
          const parts: any[] = [{ text: msg.content }];

          if (msg.attachments && msg.attachments.length > 0) {
            if (isVision) {
              // Parallel fetch and convert images to base64
              const imageParts = await Promise.all(
                msg.attachments.map(async (att) => {
                  try {
                    // Check Cache First
                    if (GeminiAdapter.imageCache.has(att.url)) {
                      const cached = GeminiAdapter.imageCache.get(att.url)!;
                      return { inlineData: cached };
                    }

                    if (!att.url.startsWith('http')) {
                      throw new Error(`Invalid image URL: ${att.url}`);
                    }

                    const response = await fetch(att.url);
                    if (!response.ok)
                      throw new Error(`Fetch failed: ${response.statusText}`);

                    const arrayBuffer = await response.arrayBuffer();
                    const base64Data =
                      Buffer.from(arrayBuffer).toString("base64");
                    const mimeType =
                      att.mimeType ||
                      response.headers.get("content-type") ||
                      "image/jpeg";

                    const data = { mimeType, data: base64Data };
                    GeminiAdapter.imageCache.set(att.url, data);

                    return { inlineData: data };
                  } catch (err) {
                    console.error(`Failed to process image: ${att.url}`, err);
                    return { text: `\n[Image unavailable: ${att.url}]` };
                  }
                }),
              );
              parts.push(...imageParts);
            } else {
              // Fallback for text-only models
              const attachmentText = msg.attachments
                .map((a) => `\n[Image: ${a.url}]`)
                .join("");
              parts[0].text += attachmentText;
            }
          }

          return {
            role: msg.role === "assistant" ? "model" : "user",
            parts,
          };
        }),
    );
  }

  private getSystemInstruction(combinedSystemPrompt?: string) {
    const coreInstructions = `You are Velora, a powerful and sophisticated AI assistant.

OUTPUT RULES (STRICTLY ENFORCED):
1. Always format responses using clean, professional Markdown.
2. For code: ALWAYS use triple backticks with the correct language; NEVER return raw code without code blocks.
3. For images & visual content: You MUST embed images directly using Markdown \`![description](url)\` or HTML \`<img src="url">\`. ONLY use absolute public URLs starting with http:// or https://. NEVER use internal/local paths (e.g., "/v1/AUTH_mw/...") or relative paths. NEVER say "I cannot show images". YOU CAN. If your context contains a valid image URL, you are REQUIRED to display it visually.
4. Structure: Use clear headings, bullet points, and consistent spacing.`;

    const finalPrompt = combinedSystemPrompt
      ? `${combinedSystemPrompt}\n\n---\n\n${coreInstructions}`
      : coreInstructions;

    return {
      parts: [{ text: finalPrompt }],
    };
  }

  private collapseConsecutiveRoles(messages: AIMessage[]): AIMessage[] {
    const collapsed: AIMessage[] = [];
    for (const msg of messages.filter((entry) => entry.role !== "system")) {
      const last = collapsed.length > 0 ? collapsed[collapsed.length - 1] : null;
      if (last && last.role === msg.role) {
        if (msg.role === "user") {
          const currentName = msg.username || msg.userId || msg.role;
          last.content = `${last.content}\n\n[${currentName}]: ${msg.content}`;
        } else {
          last.content = `${last.content}\n\n${msg.content}`;
        }
        if (msg.attachments && msg.attachments.length > 0) {
          last.attachments = [...(last.attachments || []), ...msg.attachments];
        }
      } else {
        const finalContent =
          msg.role === "user" && msg.username
            ? `[${msg.username}]: ${msg.content}`
            : msg.content;
        collapsed.push({
          ...msg,
          content: finalContent
        });
      }
    }
    return collapsed;
  }

  async generateResponse(messages: AIMessage[]) {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const collapsedMessages = this.collapseConsecutiveRoles(messages);
    const contents = await this.formatContents(collapsedMessages);

    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    try {
      const res = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: this.getSystemInstruction(combinedSystemPrompt),
        },
      });

      const text =
        res?.candidates?.[0]?.content?.parts?.[0]?.text || res?.text || "";

      return {
        text: text.trim() || "No response generated.",
        usage: normalizeGeminiUsageMetadata(
          (res as any).usageMetadata ?? (res as any).usage_metadata,
        ),
      };
    } catch (error: any) {
      console.error("Gemini Adapter Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): Promise<AIStreamResponse> {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const collapsedMessages = this.collapseConsecutiveRoles(messages);
    const contents = await this.formatContents(collapsedMessages);

    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    let streamedText = "";

    try {
      const res = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: this.getSystemInstruction(combinedSystemPrompt),
        },
      } as any);

      let latestUsage: ReturnType<typeof normalizeGeminiUsageMetadata>;
      let settleUsage: (
        usage: ReturnType<typeof normalizeGeminiUsageMetadata>,
      ) => void = () => undefined;
      let usageSettled = false;
      const usage = new Promise<
        ReturnType<typeof normalizeGeminiUsageMetadata>
      >((resolve) => {
        settleUsage = (value) => {
          if (!usageSettled) {
            usageSettled = true;
            resolve(value);
          }
        };
      });

      return {
        usage,
        async *[Symbol.asyncIterator]() {
          try {
            for await (const chunk of res) {
              if (signal?.aborted) {
                return;
              }
              const normalizedUsage = normalizeGeminiUsageMetadata(
                (chunk as any).usageMetadata ?? (chunk as any).usage_metadata,
              );
              if (normalizedUsage) {
                latestUsage = normalizedUsage;
              }
              const text = chunk.text;
              if (text) {
                streamedText += text;
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

      console.error("Gemini Adapter Stream Error:", error);

      if (error?.message?.includes("Incomplete JSON segment")) {
        const fallbackResponse = await this.ai.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction: this.getSystemInstruction(combinedSystemPrompt),
          },
        });
        const text =
          fallbackResponse?.candidates?.[0]?.content?.parts?.[0]?.text ||
          fallbackResponse?.text ||
          "";

        if (text.trim()) {
          const fallbackText = text.trim();
          return {
            usage: Promise.resolve(
              normalizeGeminiUsageMetadata(
                (fallbackResponse as any).usageMetadata ??
                  (fallbackResponse as any).usage_metadata,
              ),
            ),
            async *[Symbol.asyncIterator]() {
              yield fallbackText;
            },
          };
        }
      }

      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async generateEmbedding(text: string, retries = 2): Promise<number[]> {
    try {
      const response = await (this.ai as any).models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
        config: { outputDimensionality: 768 },
      });

      return response.embeddings?.[0]?.values || response.embeddings || [];
    } catch (error: any) {
      console.error(
        `Gemini Embedding Error (Retries left: ${retries}):`,
        error,
      );
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000)); // Wait 1s
        return this.generateEmbedding(text, retries - 1);
      }
      return [];
    }
  }
}
