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
import { mcpClientService } from "../../mcpClient.service";
import { CORE_VELORA_INSTRUCTIONS } from "../../../constants/prompt.constants";

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

  private getRealModelName(modelName: string): string {
    return modelName;
  }

  private mergeUsage(
    current: ReturnType<typeof normalizeOpenAIUsage>,
    next: ReturnType<typeof normalizeOpenAIUsage>,
  ): ReturnType<typeof normalizeOpenAIUsage> {
    if (!next) return current;
    if (!current) return next;

    return {
      promptTokens: current.promptTokens + next.promptTokens,
      completionTokens: current.completionTokens + next.completionTokens,
      totalTokens: current.totalTokens + next.totalTokens,
    };
  }

  private async formatMessages(messages: AIMessage[]) {
    const isVision = supportsVision(this.model);

    return Promise.all(
      messages.map(async (msg) => {
        const role =
          msg.role === "system"
            ? "system"
            : msg.role === "assistant"
              ? "assistant"
              : "user";

        if (msg.attachments && msg.attachments.length > 0 && isVision) {
          const contentParts: any[] = [
            { type: "text", text: msg.content || "" },
          ];

          for (const att of msg.attachments) {
            try {
              let mimeType = att.mimeType || "image/jpeg";
              let imageUrl = att.url;
              let isSupportedImage = false;

              if (att.url.startsWith("http")) {
                if (OpenAIAdapter.imageCache.has(att.url)) {
                  imageUrl = OpenAIAdapter.imageCache.get(att.url)!;
                  // If we cached it, we assume it's a valid data URL
                  isSupportedImage = true;
                } else {
                  // Only fetch if it might be an image to save bandwidth for PDFs/etc
                  if (!mimeType || mimeType.startsWith("image/")) {
                    const res = await fetch(att.url);
                    if (res.ok) {
                      mimeType = res.headers.get("content-type") || mimeType;

                      // Explicitly exclude SVG from being passed as an image to OpenAI
                      if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
                        const arrayBuffer = await res.arrayBuffer();
                        const base64Data = Buffer.from(arrayBuffer).toString("base64");
                        imageUrl = `data:${mimeType};base64,${base64Data}`;

                        if (OpenAIAdapter.imageCache.size > 500) {
                          const firstKey = OpenAIAdapter.imageCache.keys().next().value;
                          if (firstKey) OpenAIAdapter.imageCache.delete(firstKey);
                        }
                        OpenAIAdapter.imageCache.set(att.url, imageUrl);
                        isSupportedImage = true;
                      }
                    } else {
                      throw new Error(`Fetch failed: ${res.statusText}`);
                    }
                  }
                }
              }

              if (isSupportedImage) {
                contentParts.push({
                  type: "image_url",
                  image_url: { url: imageUrl },
                });
              } else {
                // For SVGs, documents, and other unsupported files, pass the absolute path to the model as text 
                // so it can use MCP tools to read the file if needed.
                const mcpPath = (att as any).localPath || att.url;
                contentParts.push({
                  type: "text",
                  text: `\n[CRITICAL INSTRUCTION: The user uploaded the file "${att.name || 'document'}". It is physically located at exactly this absolute path: ${mcpPath}. DO NOT hallucinate paths like /mnt/data/. You MUST use this exact path ${mcpPath} for all MCP tool executions!]`
                });
              }
            } catch (err) {
              // Silently ignore dead links or unfetchable images
              contentParts.push({
                type: "text",
                text: `\n[File unavailable: ${att.url}]`
              });
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

  private getSystemInstruction(combinedSystemPrompt?: string, hasTools = false): string {
    let coreInstructions = CORE_VELORA_INSTRUCTIONS;

    if (!hasTools) {
      coreInstructions = coreInstructions.replace(/TOOL-USE & ANTI-HALLUCINATION RULES[\s\S]*?(?=OUTPUT RULES)/, "");
    }

    return combinedSystemPrompt
      ? `${combinedSystemPrompt}\n\n---\n\n${coreInstructions}`
      : coreInstructions;
  }

  private mapMcpToolsToOpenAI(
    tools?: any[],
  ): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.inputSchema || { type: "object", properties: {} },
      },
    }));
  }

  async generateResponse(messages: AIMessage[], tools?: any[]) {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    const formattedInput = await this.formatMessages(
      messages.filter((msg) => msg.role !== "system"),
    );

    const finalMessages = [
      {
        role: "system" as const,
        content: this.getSystemInstruction(combinedSystemPrompt, !!(tools && tools.length > 0)),
      },
      ...formattedInput,
    ] as any[];

    const openAITools = this.mapMcpToolsToOpenAI(tools);
    let hasToolCalls = true;
    let loopCount = 0;
    const maxLoops = 10;
    let finalOutput = "";
    let totalUsage: ReturnType<typeof normalizeOpenAIUsage> = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (hasToolCalls && loopCount < maxLoops) {
        loopCount++;
        hasToolCalls = false;

        const response = await this.openai.chat.completions.create({
          model: this.getRealModelName(this.model),
          messages: finalMessages as any,
          ...(openAITools ? { tools: openAITools } : {}),
        });

        totalUsage = this.mergeUsage(
          totalUsage,
          normalizeOpenAIUsage((response as any).usage),
        );

        const choice = response.choices[0];
        const text = choice.message?.content || "";
        if (text) {
          finalOutput += text;
        }

        const toolCalls = choice.message?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          hasToolCalls = true;
          finalMessages.push(choice.message);

          const responseMessages = await Promise.all(
            toolCalls.map(async (tc) => {
              try {
                const toolName = (tc as any).function.name;
                const isAllowed = tools && tools.some((t) => t.name === toolName);
                if (!isAllowed) {
                  throw new Error(`Tool "${toolName}" is disabled or not allowed.`);
                }
                const args = JSON.parse((tc as any).function.arguments);
                const result = await mcpClientService.executeTool(
                  toolName,
                  args,
                );
                return {
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify(result),
                };
              } catch (err: any) {
                const errMsg = `${err.message || String(err)}. [SYSTEM NOTE: The tool failed or returned no results. Explicitly tell the user that you couldn't get the requested information (e.g. "I don't get info about that weather" or similar). Do NOT guess, speculate, or fabricate any details under any circumstances.]`;
                return {
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    error: errMsg,
                  }),
                };
              }
            }),
          );

          finalMessages.push(...responseMessages);
        }
      }

      return {
        text: finalOutput.trim() || "No response generated.",
        usage: totalUsage,
      };
    } catch (error: any) {
      console.error("OpenAI Adapter Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
    tools?: any[],
  ): Promise<AIStreamResponse> {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    const formattedInput = await this.formatMessages(
      messages.filter((msg) => msg.role !== "system"),
    );

    const finalMessages = [
      {
        role: "system" as const,
        content: this.getSystemInstruction(combinedSystemPrompt, !!(tools && tools.length > 0)),
      },
      ...formattedInput,
    ] as any[];

    const openAITools = this.mapMcpToolsToOpenAI(tools);
    let latestUsage: ReturnType<typeof normalizeOpenAIUsage> = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
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
            console.log("OPENAI model: ", adapter.getRealModelName(adapter.model))

            const stream = await adapter.openai.chat.completions.create(
              {
                model: adapter.getRealModelName(adapter.model),
                messages: finalMessages as any,
                ...(openAITools ? { tools: openAITools } : {}),
                stream: true,
                stream_options: { include_usage: true },
              },
              { signal },
            );

            let accumulatedText = "";
            let activeToolCalls: any[] = [];

            for await (const chunk of stream) {
              if (signal?.aborted) {
                return;
              }

              latestUsage = adapter.mergeUsage(
                latestUsage,
                normalizeOpenAIUsage((chunk as any).usage),
              );

              const choice = chunk.choices?.[0];
              const text = choice?.delta?.content || "";
              if (text) {
                accumulatedText += text;
                yield text;
              }

              const toolCallDeltas = choice?.delta?.tool_calls;
              if (toolCallDeltas) {
                for (const tcDelta of toolCallDeltas) {
                  if (!activeToolCalls[tcDelta.index]) {
                    activeToolCalls[tcDelta.index] = {
                      id: tcDelta.id,
                      type: "function",
                      function: { name: "", arguments: "" },
                    };
                  }
                  const tc = activeToolCalls[tcDelta.index];
                  if (tcDelta.id) tc.id = tcDelta.id;
                  if (tcDelta.function?.name) {
                    tc.function.name += tcDelta.function.name;
                  }
                  if (tcDelta.function?.arguments) {
                    tc.function.arguments += tcDelta.function.arguments;
                  }
                }
              }
            }

            activeToolCalls = activeToolCalls.filter(Boolean);
            if (activeToolCalls.length === 0) {
              break;
            }

            hasToolCalls = true;
            finalMessages.push({
              role: "assistant",
              content: accumulatedText,
              tool_calls: activeToolCalls,
            });

            const responseMessages = [];
            for (const tc of activeToolCalls) {
              const toolCall = tc as any;
              yield `\n\n⚙️ *Running tool \`${toolCall.function.name}\`...*\n`;

              try {
                const toolName = toolCall.function.name;
                const isAllowed = tools && tools.some((t) => t.name === toolName);
                if (!isAllowed) {
                  throw new Error(`Tool "${toolName}" is disabled or not allowed.`);
                }
                const args = JSON.parse(toolCall.function.arguments);
                const result = await mcpClientService.executeTool(
                  toolName,
                  args,
                );
                yield `\n\n✅ *Tool \`${toolCall.function.name}\` completed.* \n\n`;

                responseMessages.push({
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify(result),
                });
              } catch (err: any) {
                yield `\n\n❌ *Tool \`${toolCall.function.name}\` failed: ${err.message || err
                  }*\n\n`;

                const errMsg = `${err.message || String(err)}. [SYSTEM NOTE: The tool failed or returned no results. Explicitly tell the user that you couldn't get the requested information (e.g. "I don't get info about that weather" or similar). Do NOT guess, speculate, or fabricate any details under any circumstances.]`;
                responseMessages.push({
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    error: errMsg,
                  }),
                });
              }
            }

            finalMessages.push(...responseMessages);
          }
        } catch (error: any) {
          if (signal?.aborted) {
            return;
          }
          console.error("OpenAI Adapter Stream Error:", error);
          throw new AIServiceError(error.message, error.status || 500);
        } finally {
          if (!latestUsage) {
            console.warn(`[OpenAIAdapter] No usage data received from model ${adapter.model} during streaming — token counts will use estimation fallback`);
          }
          settleUsage(latestUsage);
        }
      },
    };
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
