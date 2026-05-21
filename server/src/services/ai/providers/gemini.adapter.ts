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
import { mcpClientService } from "../../mcpClient.service";
import { CORE_VELORA_INSTRUCTIONS } from "../../../constants/prompt.constants";

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

  private mergeUsage(
    current: ReturnType<typeof normalizeGeminiUsageMetadata>,
    next: ReturnType<typeof normalizeGeminiUsageMetadata>,
  ): ReturnType<typeof normalizeGeminiUsageMetadata> {
    if (!next) return current;
    if (!current) return next;

    return {
      promptTokens: current.promptTokens + next.promptTokens,
      completionTokens: current.completionTokens + next.completionTokens,
      totalTokens: current.totalTokens + next.totalTokens,
    };
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
              const imageParts = await Promise.all(
                msg.attachments.map(async (att) => {
                  try {
                    if (GeminiAdapter.imageCache.has(att.url)) {
                      const cached = GeminiAdapter.imageCache.get(att.url)!;
                      return { inlineData: cached };
                    }

                    if (!att.url.startsWith("http")) {
                      throw new Error(`Invalid image URL: ${att.url}`);
                    }

                    const response = await fetch(att.url);
                    if (!response.ok) {
                      throw new Error(`Fetch failed: ${response.statusText}`);
                    }

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

  private getSystemInstruction(combinedSystemPrompt?: string, hasTools = false) {
    let coreInstructions = CORE_VELORA_INSTRUCTIONS;

    if (!hasTools) {
      coreInstructions = coreInstructions.replace(/TOOL-USE & ANTI-HALLUCINATION RULES[\s\S]*?(?=OUTPUT RULES)/, "");
    }

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
      const last =
        collapsed.length > 0 ? collapsed[collapsed.length - 1] : null;
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
          content: finalContent,
        });
      }
    }
    return collapsed;
  }

  private mapJsonSchemaToGemini(schema: any): any {
    if (!schema) return undefined;

    const mapped: any = {};

    if (schema.type) {
      mapped.type = String(schema.type).toUpperCase();
    } else {
      mapped.type = "STRING";
    }

    if (schema.description) {
      mapped.description = schema.description;
    }

    if (schema.properties) {
      mapped.properties = Object.fromEntries(
        Object.entries(schema.properties).map(
          ([key, propSchema]: [string, any]) => [
            key,
            this.mapJsonSchemaToGemini(propSchema),
          ],
        ),
      );
    }

    if (schema.required) {
      mapped.required = schema.required;
    }

    if (schema.items) {
      mapped.items = this.mapJsonSchemaToGemini(schema.items);
    } else if (mapped.type === "ARRAY") {
      mapped.items = { type: "STRING" };
    }

    if (schema.enum) {
      mapped.enum = schema.enum;
    }

    return mapped;
  }

  private mapMcpToolsToGemini(tools?: any[]) {
    if (!tools || tools.length === 0) return undefined;

    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description || "",
          parameters: this.mapJsonSchemaToGemini(t.inputSchema) || {
            type: "OBJECT",
            properties: {},
            required: [],
          },
        })),
      },
    ];
  }

  async generateResponse(messages: AIMessage[], tools?: any[]) {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const collapsedMessages = this.collapseConsecutiveRoles(messages);
    const contents = await this.formatContents(collapsedMessages);

    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    const geminiTools = this.mapMcpToolsToGemini(tools);
    let hasToolCalls = true;
    let loopCount = 0;
    const maxLoops = 10;
    let finalOutput = "";
    let totalUsage: ReturnType<typeof normalizeGeminiUsageMetadata>;

    try {
      while (hasToolCalls && loopCount < maxLoops) {
        loopCount++;
        hasToolCalls = false;

        const config: any = {
          systemInstruction: this.getSystemInstruction(combinedSystemPrompt, !!(tools && tools.length > 0)),
        };
        if (geminiTools) {
          config.tools = geminiTools;
        }

        const res = await this.ai.models.generateContent({
          model: this.model,
          contents,
          config,
        });

        totalUsage = this.mergeUsage(
          totalUsage,
          normalizeGeminiUsageMetadata(
            (res as any).usageMetadata ?? (res as any).usage_metadata,
          ),
        );

        const text =
          res?.candidates?.[0]?.content?.parts?.[0]?.text || res?.text || "";
        if (text) {
          finalOutput += text;
        }

        const functionCalls = res.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          hasToolCalls = true;

          const modelContent = res.candidates?.[0]?.content;
          contents.push({
            role: "model",
            parts:
              modelContent?.parts && modelContent.parts.length > 0
                ? modelContent.parts
                : functionCalls.map((f) => ({
                    functionCall: {
                      name: f.name,
                      args: f.args,
                    },
                  })),
          } as any);

          const responseParts = await Promise.all(
            functionCalls.map(async (f) => {
              try {
                const isAllowed = tools && tools.some((t) => t.name === f.name);
                if (!isAllowed) {
                  throw new Error(`Tool "${f.name}" is disabled or not allowed.`);
                }
                const result = await mcpClientService.executeTool(
                  f.name!,
                  f.args,
                );
                return {
                  functionResponse: {
                    name: f.name!,
                    response: { result },
                  },
                };
              } catch (err: any) {
                const errMsg = `${err.message || String(err)}. [SYSTEM NOTE: The tool failed or returned no results. Explicitly tell the user that you couldn't get the requested information (e.g. "I don't get info about that weather" or similar). Do NOT guess, speculate, or fabricate any details under any circumstances.]`;
                return {
                  functionResponse: {
                    name: f.name!,
                    response: { error: errMsg },
                  },
                };
              }
            }),
          );

          contents.push({
            role: "user",
            parts: responseParts,
          } as any);
        }
      }

      return {
        text: finalOutput.trim() || "No response generated.",
        usage: totalUsage,
      };
    } catch (error: any) {
      console.error("Gemini Adapter Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
    tools?: any[],
  ): Promise<AIStreamResponse> {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const collapsedMessages = this.collapseConsecutiveRoles(messages);
    const contents = await this.formatContents(collapsedMessages);

    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    const geminiTools = this.mapMcpToolsToGemini(tools);
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
    const adapter = this;

    return {
      usage,
      async *[Symbol.asyncIterator]() {
        try {
          let hasToolCalls = true;
          let loopCount = 0;
          const maxLoops = 10;

          while (hasToolCalls && loopCount < maxLoops) {
            loopCount++;
            hasToolCalls = false;

            const config: any = {
              systemInstruction:
                adapter.getSystemInstruction(combinedSystemPrompt, !!(tools && tools.length > 0)),
            };
            if (geminiTools) {
              config.tools = geminiTools;
            }

            const res = await adapter.ai.models.generateContentStream({
              model: adapter.model,
              contents,
              config,
            } as any);

            const activeFunctionCalls: any[] = [];
            const accumulatedParts: any[] = [];

            for await (const chunk of res) {
              if (signal?.aborted) {
                return;
              }

              latestUsage = adapter.mergeUsage(
                latestUsage,
                normalizeGeminiUsageMetadata(
                  (chunk as any).usageMetadata ?? (chunk as any).usage_metadata,
                ),
              );

              const text = chunk.text;
              if (text) {
                yield text;
              }

              const parts = chunk.candidates?.[0]?.content?.parts;
              if (parts && parts.length > 0) {
                accumulatedParts.push(...parts);
              }

              const functionCalls = chunk.functionCalls;
              if (functionCalls && functionCalls.length > 0) {
                activeFunctionCalls.push(...functionCalls);
              }
            }

            if (activeFunctionCalls.length === 0) {
              break;
            }

            hasToolCalls = true;
            contents.push({
              role: "model",
              parts:
                accumulatedParts.length > 0
                  ? accumulatedParts
                  : activeFunctionCalls.map((f) => ({
                      functionCall: {
                        name: f.name,
                        args: f.args,
                      },
                    })),
            } as any);

            const responseParts = [];
            for (const f of activeFunctionCalls) {
              if (!f.name) continue;

              yield `\n\n⚙️ *Running tool \`${f.name}\`...*\n`;

              try {
                const isAllowed = tools && tools.some((t) => t.name === f.name);
                if (!isAllowed) {
                  throw new Error(`Tool "${f.name}" is disabled or not allowed.`);
                }
                const result = await mcpClientService.executeTool(
                  f.name,
                  f.args,
                );
                yield `\n\n✅ *Tool \`${f.name}\` completed.* \n\n`;

                responseParts.push({
                  functionResponse: {
                    name: f.name,
                    response: { result },
                  },
                });
              } catch (err: any) {
                yield `\n\n❌ *Tool \`${f.name}\` failed: ${
                  err.message || err
                }*\n\n`;

                const errMsg = `${err.message || String(err)}. [SYSTEM NOTE: The tool failed or returned no results. Explicitly tell the user that you couldn't get the requested information (e.g. "I don't get info about that weather" or similar). Do NOT guess, speculate, or fabricate any details under any circumstances.]`;
                responseParts.push({
                  functionResponse: {
                    name: f.name,
                    response: { error: errMsg },
                  },
                });
              }
            }

            contents.push({
              role: "user",
              parts: responseParts,
            } as any);
          }
        } catch (error: any) {
          if (signal?.aborted) {
            return;
          }

          console.error("Gemini Adapter Stream Error:", error);

          if (error?.message?.includes("Incomplete JSON segment")) {
            const fallbackResponse = await adapter.ai.models.generateContent({
              model: adapter.model,
              contents,
              config: {
                systemInstruction:
                  adapter.getSystemInstruction(combinedSystemPrompt, !!(tools && tools.length > 0)),
              },
            });
            latestUsage = adapter.mergeUsage(
              latestUsage,
              normalizeGeminiUsageMetadata(
                (fallbackResponse as any).usageMetadata ??
                  (fallbackResponse as any).usage_metadata,
              ),
            );
            const text =
              fallbackResponse?.candidates?.[0]?.content?.parts?.[0]?.text ||
              fallbackResponse?.text ||
              "";

            if (text.trim()) {
              yield text.trim();
              return;
            }
          }

          throw new AIServiceError(error.message, error.status || 500);
        } finally {
          settleUsage(latestUsage);
        }
      },
    };
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
        await new Promise((r) => setTimeout(r, 1000));
        return this.generateEmbedding(text, retries - 1);
      }
      return [];
    }
  }
}
