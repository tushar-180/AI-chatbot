import OpenAI from "openai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError, AIStreamResponse } from "../types";
import {
  AI_PROVIDERS,
  getDisplayProviderName,
  supportsVision,
} from "../constants";
import { normalizeOpenAIUsage } from "../../../utils/tokenCounter";
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
      apiKey,
      baseURL,
    });
  }

  getProviderName(): string {
    return getDisplayProviderName(AI_PROVIDERS.NVIDIA.id, this.model);
  }

  setModel(model: string): void {
    this.model = model;
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

  private getSystemInstruction(combinedSystemPrompt?: string, hasTools = false): string {
    let coreInstructions = CORE_VELORA_INSTRUCTIONS;

    if (!hasTools) {
      coreInstructions = coreInstructions.replace(/TOOL-USE & ANTI-HALLUCINATION RULES[\s\S]*?(?=OUTPUT RULES)/, "");
    }

    return combinedSystemPrompt
      ? `${combinedSystemPrompt}\n\n---\n\n${coreInstructions}`
      : coreInstructions;
  }

  private formatMessages(messages: AIMessage[], hasTools = false) {
    const isVision = supportsVision(this.model);

    const systemMessages = messages.filter((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");
    const combinedSystemContent = systemMessages
      .map((m) => m.content)
      .join("\n\n---\n\n");

    const formattedMessages: any[] = [
      {
        role: "system",
        content: this.getSystemInstruction(combinedSystemContent, hasTools),
      },
    ];

    const formattedChatMessages = chatMessages.map((m) => {
      let content: any = m.content;

      if (m.attachments && m.attachments.length > 0) {
        if (!isVision) {
          const attachmentText = m.attachments
            .map((a) => `\n[Image: ${a.url}]`)
            .join("");
          content += attachmentText;
        } else {
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

    return [...formattedMessages, ...formattedChatMessages];
  }

  private mapMcpToolsToNvidia(tools?: any[]): any[] | undefined {
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
    const finalMessages = this.formatMessages(messages, !!(tools && tools.length > 0));
    const nvidiaTools = this.mapMcpToolsToNvidia(tools);

    let hasToolCalls = true;
    let loopCount = 0;
    const maxLoops = MCP_TOOL_LOOP_LIMIT;
    let consecutiveErrorRounds = 0;
    let finalOutput = "";
    let totalUsage: ReturnType<typeof normalizeOpenAIUsage>;

    try {
      while (hasToolCalls && loopCount < maxLoops) {
        loopCount++;
        hasToolCalls = false;

        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: finalMessages as any,
          ...(nvidiaTools ? { tools: nvidiaTools } : {}),
          temperature: 0.6,
          top_p: 0.7,
          max_tokens: 4096,
        });

        totalUsage = this.mergeUsage(
          totalUsage,
          normalizeOpenAIUsage((completion as any).usage),
        );

        const choice = completion.choices[0];
        const text = choice.message?.content || "";
        if (text) {
          finalOutput += text;
        }

        const toolCalls = choice.message?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          hasToolCalls = true;
          finalMessages.push(choice.message);
          let hadToolError = false;

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
                  content: this.formatToolSuccessResult(result),
                };
              } catch (err: any) {
                hadToolError = true;
                return {
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: this.formatToolErrorResult(err, consecutiveErrorRounds + 1),
                };
              }
            }),
          );

          finalMessages.push(...responseMessages);
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
      console.error("NVIDIA generateResponse error:", error);
      throw new AIServiceError(
        error.message || "Failed to generate response from NVIDIA NIM",
        error.status,
      );
    }
  }

  async generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
    tools?: any[],
  ): Promise<AIStreamResponse> {
    const finalMessages = this.formatMessages(messages, !!(tools && tools.length > 0));
    const nvidiaTools = this.mapMcpToolsToNvidia(tools);

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

            let streamOptions: { include_usage: boolean } | undefined = { include_usage: true };

            const stream = await adapter.openai.chat.completions.create(
              {
                model: adapter.model,
                messages: finalMessages as any,
                ...(nvidiaTools ? { tools: nvidiaTools } : {}),
                temperature: 0.6,
                top_p: 0.7,
                max_tokens: 4096,
                stream: true,
                ...(streamOptions ? { stream_options: streamOptions } : {}),
              },
              { signal },
            ).catch(async (err: any) => {
              // Some NIM models don't support stream_options — retry without it
              if (err?.status === 400 || err?.message?.includes("stream_options")) {
                console.warn(`[NvidiaAdapter] Model ${adapter.model} doesn't support stream_options, retrying without it`);
                streamOptions = undefined;
                return adapter.openai.chat.completions.create(
                  {
                    model: adapter.model,
                    messages: finalMessages as any,
                    ...(nvidiaTools ? { tools: nvidiaTools } : {}),
                    temperature: 0.6,
                    top_p: 0.7,
                    max_tokens: 4096,
                    stream: true,
                  },
                  { signal },
                );
              }
              throw err;
            });

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
              const content = choice?.delta?.content || "";
              if (content) {
                accumulatedText += content;
                finalStreamText += content;
                yield content;
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
            let hadToolError = false;
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
                  content: adapter.formatToolSuccessResult(result),
                });
              } catch (err: any) {
                hadToolError = true;
                yield `\n\n❌ *Tool \`${toolCall.function.name}\` failed: ${
                  err.message || err
                }*\n\n`;

                responseMessages.push({
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: adapter.formatToolErrorResult(err, consecutiveErrorRounds + 1),
                });
              }
            }

            finalMessages.push(...responseMessages);
            consecutiveErrorRounds = hadToolError ? consecutiveErrorRounds + 1 : 0;
            if (consecutiveErrorRounds >= MCP_TOOL_ERROR_RETRY_LIMIT) {
              yield `\n\n${MCP_TOOL_ERROR_FALLBACK_MESSAGE}\n`;
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
          console.error("NVIDIA generateStreamResponse error:", error);

          // 410 Gone = model has been deprecated/removed from NVIDIA NIM
          const message =
            error.status === 410
              ? `The model \`${adapter.model}\` is no longer available on NVIDIA NIM (removed/deprecated). Please switch to a different model.`
              : error.message || "Failed to generate stream response from NVIDIA NIM";

          throw new AIServiceError(message, error.status);
        } finally {
          if (!latestUsage) {
            console.warn(`[NvidiaAdapter] No usage data received from model ${adapter.model} during streaming — token counts will use estimation fallback`);
          }
          settleUsage(latestUsage);
        }
      },
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return [];
  }
}
