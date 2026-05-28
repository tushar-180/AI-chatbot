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
import {
  CORE_VELORA_INSTRUCTIONS,
  MCP_TOOL_ERROR_FALLBACK_MESSAGE,
  MCP_TOOL_ERROR_NOTE,
  MCP_TOOL_ERROR_RETRY_LIMIT,
  MCP_TOOL_FALLBACK_MESSAGE,
  MCP_TOOL_LOOP_LIMIT,
  MCP_TOOL_SUCCESS_NOTE,
} from "../../../constants/prompt.constants";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

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

  private async ensureLocalFileExists(localPath: string, url: string) {
    if (localPath && url && !existsSync(localPath)) {
      try {
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        const res = await fetch(url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(localPath, buffer);
          console.log(`[Auto-Restore] Restored ${localPath} from Supabase.`);
        }
      } catch (err) {
        console.warn(`[Auto-Restore] Failed to restore ${localPath}:`, err);
      }
    }
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

                    // Fast path: if we already know it's not a vision/multimodal file, skip fetching entirely
                    const isDefinitelyUnsupported =
                      att.mimeType &&
                      !att.mimeType.startsWith("image/") &&
                      !att.mimeType.startsWith("video/") &&
                      !att.mimeType.startsWith("audio/");

                    if (isDefinitelyUnsupported) {
                      const mcpPath = (att as any).localPath || att.url;
                      await this.ensureLocalFileExists((att as any).localPath, att.url);
                      return { text: `\n[CRITICAL INSTRUCTION: The user uploaded the file "${att.name}". It is physically located at exactly this absolute path: ${mcpPath}. DO NOT hallucinate paths like /mnt/data/. You MUST use this exact path ${mcpPath} for all MCP tool executions!]` };
                    }

                    const response = await fetch(att.url, {
                      headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                      }
                    });
                    if (!response.ok) {
                      throw new Error(`Fetch failed: ${response.statusText}`);
                    }

                    let mimeType =
                      att.mimeType ||
                      response.headers.get("content-type") ||
                      "image/jpeg";

                    if (mimeType === "image/remote") {
                      mimeType = response.headers.get("content-type") || "image/jpeg";
                    }

                    const isImageVideoAudio =
                      (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") ||
                      mimeType.startsWith("video/") ||
                      mimeType.startsWith("audio/");

                    const isDocument =
                      mimeType === "application/pdf" ||
                      mimeType.startsWith("text/") ||
                      mimeType === "application/json" ||
                      mimeType === "application/rtf" ||
                      mimeType === "application/x-javascript" ||
                      mimeType === "application/x-python";

                    if (!isImageVideoAudio && (!isDocument || !(att as any).inlineFallback)) {
                      const mcpPath = (att as any).localPath || att.url;
                      await this.ensureLocalFileExists((att as any).localPath, att.url);
                      return { text: `\n[CRITICAL INSTRUCTION: The user uploaded the file "${att.name}". It is physically located at exactly this absolute path: ${mcpPath}. DO NOT hallucinate paths like /mnt/data/. You MUST use this exact path ${mcpPath} for all MCP tool executions!]` };
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const base64Data =
                      Buffer.from(arrayBuffer).toString("base64");

                    const data = { mimeType, data: base64Data };

                    if (GeminiAdapter.imageCache.size > 500) {
                      const firstKey = GeminiAdapter.imageCache.keys().next().value;
                      if (firstKey) GeminiAdapter.imageCache.delete(firstKey);
                    }
                    GeminiAdapter.imageCache.set(att.url, data);

                    return { inlineData: data };
                  } catch (err) {
                    // Silently ignore dead links or unfetchable images
                    return { text: `\n[File unavailable: ${att.url}]` };
                  }
                }),
              );
              parts.push(...imageParts);
            } else {
              const attachmentText = msg.attachments
                .map((a) => `\n[File: ${a.url}]`)
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

    // Do NOT strip instructions if hasTools is false. The core Velora instructions 
    // are needed for web search and image generation to work properly!

    const mcpInstruction = hasTools
      ? "\n\n[CRITICAL INSTRUCTION FOR MCP TOOLS: You have access to various tools via MCP. RULE 1: DO NOT attempt to use any file analysis or parsing tools (such as Excel, CSV, or PDF tools) unless the user has explicitly uploaded a corresponding file in this conversation. If no file is attached, you MUST NOT guess or hallucinate that a file exists. RULE 2: Use Web Search tools only if the user explicitly asks to search or if you require real-time/updated data to answer the query. RULE 3: After a tool response, treat it as authoritative and do not repeat the same or an equivalent tool call unless the user provides new information or the output clearly shows a different missing detail. RULE 4: If you lack the required context or files to use a tool, fulfill the request using your own knowledge or admit you cannot answer.]"
      : "";

    const finalPrompt = combinedSystemPrompt
      ? `${combinedSystemPrompt}\n\n---\n\n${coreInstructions}${mcpInstruction}`
      : `${coreInstructions}${mcpInstruction}`;

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
          last.content = `${last.content}\n\n${currentName}: ${msg.content}`;
        } else {
          last.content = `${last.content}\n\n${msg.content}`;
        }
        if (msg.attachments && msg.attachments.length > 0) {
          last.attachments = [...(last.attachments || []), ...msg.attachments];
        }
      } else {
        const finalContent =
          msg.role === "user" && msg.username
            ? `${msg.username}: ${msg.content}`
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

  private formatToolSuccessResult(result: unknown): string {
    let text: string;
    if (result && typeof result === "object" && Array.isArray((result as any).content)) {
      text = (result as any).content
        .filter((c: any) => c.type === "text" && c.text)
        .map((c: any) => c.text)
        .join("\n");
      if (!text) text = JSON.stringify(result);
    } else {
      text = typeof result === "string" ? result : JSON.stringify(result);
    }
    if (text.length > 4000) {
      text = text.substring(0, 4000) + "\n...[Note: results truncated for brevity]";
    }
    return `${text}\n\n${MCP_TOOL_SUCCESS_NOTE}`;
  }

  private formatToolErrorResult(err: unknown, attempt: number): string {
    const message =
      err instanceof Error ? err.message : String(err || "Unknown tool error");
    return JSON.stringify({
      error: `${message}. ${MCP_TOOL_ERROR_NOTE(attempt)}`,
    });
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
    const maxLoops = MCP_TOOL_LOOP_LIMIT;
    let consecutiveErrorRounds = 0;
    let finalOutput = "";
    let totalUsage: ReturnType<typeof normalizeGeminiUsageMetadata> = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

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
          let hadToolError = false;

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

                let resultString = this.formatToolSuccessResult(result);

                return {
                  functionResponse: {
                    name: f.name!,
                    response: { result: resultString },
                  },
                };
              } catch (err: any) {
                hadToolError = true;
                return {
                  functionResponse: {
                    name: f.name!,
                    response: { error: this.formatToolErrorResult(err, consecutiveErrorRounds + 1) },
                  },
                };
              }
            }),
          );

          contents.push({
            role: "user",
            parts: responseParts,
          } as any);

          consecutiveErrorRounds = hadToolError ? consecutiveErrorRounds + 1 : 0;
          if (consecutiveErrorRounds >= MCP_TOOL_ERROR_RETRY_LIMIT) {
            finalOutput = finalOutput.trim()
              ? `${finalOutput.trim()}\n\n${MCP_TOOL_ERROR_FALLBACK_MESSAGE}`
              : MCP_TOOL_ERROR_FALLBACK_MESSAGE;
            break;
          }
        }
      }

      if (loopCount >= maxLoops && hasToolCalls && !finalOutput.trim()) {
        finalOutput = MCP_TOOL_FALLBACK_MESSAGE;
      }

      return {
        text: finalOutput.trim() || MCP_TOOL_FALLBACK_MESSAGE,
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
    console.log("Gemini Tools--->", geminiTools);
    let totalUsage: ReturnType<typeof normalizeGeminiUsageMetadata> = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
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
          const maxLoops = MCP_TOOL_LOOP_LIMIT;
          let finalStreamText = "";
          let consecutiveErrorRounds = 0;

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
            console.log("res---->", res);   
            const activeFunctionCalls: any[] = [];
            const accumulatedParts: any[] = [];

            for await (const chunk of res) {
              if (signal?.aborted) {
                return;
              }

              // Gemini reports cumulative usage per chunk, so take the latest value
              const chunkUsage = normalizeGeminiUsageMetadata(
                (chunk as any).usageMetadata ?? (chunk as any).usage_metadata,
              );
              if (chunkUsage) {
                totalUsage = chunkUsage;
              }

              const text = chunk.text;
              if (text) {
                finalStreamText += text;
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
            let hadToolError = false;
            for (const f of activeFunctionCalls) {
              if (!f.name) continue;

              yield `\n\n[TOOL_RUNNING:${f.name}]\n\n`;

              try {
                const isAllowed = tools && tools.some((t) => t.name === f.name);
                if (!isAllowed) {
                  throw new Error(`Tool "${f.name}" is disabled or not allowed.`);
                }
                const result = await mcpClientService.executeTool(
                  f.name,
                  f.args,
                );
                yield `\n\n[TOOL_COMPLETED:${f.name}]\n\n`;

                let resultString = adapter.formatToolSuccessResult(result);

                responseParts.push({
                  functionResponse: {
                    name: f.name,
                    response: { result: resultString },
                  },
                });
              } catch (err: any) {
                hadToolError = true;
                yield `\n\n[TOOL_ERROR:${f.name}:${err.message || err}]\n\n`;

                responseParts.push({
                  functionResponse: {
                    name: f.name,
                    response: { error: adapter.formatToolErrorResult(err, consecutiveErrorRounds + 1) },
                  },
                });
              }
            }

            contents.push({
              role: "user",
              parts: responseParts,
            } as any);

            consecutiveErrorRounds = hadToolError ? consecutiveErrorRounds + 1 : 0;
            if (consecutiveErrorRounds >= MCP_TOOL_ERROR_RETRY_LIMIT) {
              if (!finalStreamText.trim()) {
                yield `\n\n${MCP_TOOL_ERROR_FALLBACK_MESSAGE}\n`;
              } else {
                yield `\n\n${MCP_TOOL_ERROR_FALLBACK_MESSAGE}\n`;
              }
              return;
            }
          }

          if (loopCount >= maxLoops && hasToolCalls && !finalStreamText.trim()) {
            yield `\n\n${MCP_TOOL_FALLBACK_MESSAGE}\n`;
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
            const fallbackUsage = normalizeGeminiUsageMetadata(
              (fallbackResponse as any).usageMetadata ??
              (fallbackResponse as any).usage_metadata,
            );
            if (fallbackUsage) {
              totalUsage = fallbackUsage;
            }
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
          settleUsage(totalUsage);
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
