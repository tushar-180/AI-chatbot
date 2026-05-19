import OpenAI from "openai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import {
    AI_PROVIDERS,
    getDisplayProviderName,
    supportsVision,
} from "../constants";
import { mcpClientService } from "../../mcpClient.service";

export class NvidiaAdapter implements IAIService {
    private openai: OpenAI;
    private model: string = AI_PROVIDERS.NVIDIA.models[0];

    constructor() {
        const apiKey = process.env.NVIDIA_API_KEY;
        const baseURL =
            process.env.NVIDIA_BASE_URL ||
            "https://integrate.api.nvidia.com/v1";

        if (!apiKey) {
            console.error(
                "NVIDIA_API_KEY is not defined in environment variables",
            );
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

    private getSystemInstruction(combinedSystemPrompt?: string): string {
        const coreInstructions = `You are Velora, a powerful and sophisticated AI assistant.

TOOL-USE & ANTI-HALLUCINATION RULES (CRITICAL):
1. You have access to a rich set of external tools and database interfaces (e.g., sqlite__query, web_search, github, etc.) exposed through Model Context Protocol (MCP).
2. Whenever a user request requires information you do not have in your immediate prompt context—such as querying database rows, finding files, searching the web, checking the weather, fetching GitHub info, or performing calculations—you MUST call the corresponding tool.
3. DO NOT hallucinate, guess, or make up facts. If a tool exists that can fetch the requested information, you are STRICTLY REQUIRED to call that tool first before rendering your final response.
4. If a tool fails or returns an error, explain the error to the user rather than guessing the correct value.

OUTPUT RULES (STRICTLY ENFORCED):
1. Always format responses using clean, professional Markdown.
2. For code: ALWAYS use triple backticks with the correct language; NEVER return raw code without code blocks.
3. For images & visual content: You MUST embed images directly using Markdown \`![description](url)\` or HTML \`<img src="url">\`. ONLY use absolute public URLs starting with http:// or https://. NEVER use internal/local paths (e.g., "/v1/AUTH_mw/...") or relative paths. NEVER say "I cannot show images". YOU CAN. If your context contains a valid image URL, you are REQUIRED to display it visually.
4. Structure: Use clear headings, bullet points, and consistent spacing.`;

        return combinedSystemPrompt
            ? `${combinedSystemPrompt}\n\n---\n\n${coreInstructions}`
            : coreInstructions;
    }

    private formatMessages(messages: AIMessage[]) {
        const isVision = supportsVision(this.model);

        const systemMessages = messages.filter((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system");

        const formattedMessages: any[] = [];

        const combinedSystemContent = systemMessages
            .map((m) => m.content)
            .join("\n\n---\n\n");

        formattedMessages.push({
            role: "system",
            content: this.getSystemInstruction(combinedSystemContent),
        });

        const formattedChatMessages = chatMessages.map((m) => {
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

    async generateResponse(messages: AIMessage[], tools?: any[]): Promise<string> {
        const formattedInput = this.formatMessages(messages);
        const finalMessages = [...formattedInput] as any[];

        let hasToolCalls = true;
        let loopCount = 0;
        const maxLoops = 10;
        let finalOutput = "";

        try {
            while (hasToolCalls && loopCount < maxLoops) {
                loopCount++;
                hasToolCalls = false;

                const nvidiaTools = this.mapMcpToolsToNvidia(tools);

                if (nvidiaTools) {
                    const response = await this.openai.chat.completions.create({
                        model: this.model,
                        messages: finalMessages as any,
                        tools: nvidiaTools,
                        temperature: 0.6,
                        top_p: 0.7,
                        max_tokens: 4096,
                    });

                    const choice = response.choices[0];
                    const text = choice.message?.content || "";
                    if (text) {
                        finalOutput += text;
                    }

                    const toolCalls = choice.message?.tool_calls;
                    if (toolCalls && toolCalls.length > 0) {
                        hasToolCalls = true;

                        // Push assistant message with tool calls to context
                        finalMessages.push(choice.message);

                        // Execute tool calls
                        const responseMessages = await Promise.all(
                            toolCalls.map(async (tc) => {
                                try {
                                    const args = JSON.parse((tc as any).function.arguments);
                                    const result = await mcpClientService.executeTool((tc as any).function.name, args);
                                    return {
                                        role: "tool" as const,
                                        tool_call_id: tc.id,
                                        content: JSON.stringify(result),
                                    };
                                } catch (err: any) {
                                    return {
                                        role: "tool" as const,
                                        tool_call_id: tc.id,
                                        content: JSON.stringify({ error: err.message || String(err) }),
                                    };
                                }
                            })
                        );

                        // Push tool results to context
                        finalMessages.push(...responseMessages);
                    }
                } else {
                    const completion = await this.openai.chat.completions.create({
                        model: this.model,
                        messages: finalMessages as any,
                        temperature: 0.6,
                        top_p: 0.7,
                        max_tokens: 4096,
                    });

                    return completion.choices[0]?.message?.content || "";
                }
            }

            return finalOutput.trim() || "No response generated.";
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
        tools?: any[],
    ): AsyncIterable<string> {
        const formattedInput = this.formatMessages(messages);
        const finalMessages = [...formattedInput] as any[];

        let hasToolCalls = true;
        let loopCount = 0;
        const maxLoops = 10;

        try {
            while (hasToolCalls && loopCount < maxLoops) {
                loopCount++;
                hasToolCalls = false;

                const nvidiaTools = this.mapMcpToolsToNvidia(tools);

                if (nvidiaTools) {
                    const stream = await this.openai.chat.completions.create(
                        {
                            model: this.model,
                            messages: finalMessages as any,
                            tools: nvidiaTools,
                            temperature: 0.6,
                            top_p: 0.7,
                            max_tokens: 4096,
                            stream: true,
                        },
                        {
                            signal,
                        },
                    );

                    let accumulatedText = "";
                    let activeToolCalls: any[] = [];

                    for await (const chunk of stream) {
                        if (signal?.aborted) {
                            return;
                        }

                        const choice = chunk.choices[0];
                        const text = choice?.delta?.content || "";
                        if (text) {
                            accumulatedText += text;
                            yield text;
                        }

                        const tcDeltas = choice?.delta?.tool_calls;
                        if (tcDeltas) {
                            for (const tcDelta of tcDeltas) {
                                if (!activeToolCalls[tcDelta.index]) {
                                    activeToolCalls[tcDelta.index] = {
                                        id: tcDelta.id,
                                        type: "function",
                                        function: { name: "", arguments: "" },
                                    };
                                }
                                const tc = activeToolCalls[tcDelta.index];
                                if (tcDelta.id) tc.id = tcDelta.id;
                                if (tcDelta.function?.name) tc.function.name += tcDelta.function.name;
                                if (tcDelta.function?.arguments) tc.function.arguments += tcDelta.function.arguments;
                            }
                        }
                    }

                    activeToolCalls = activeToolCalls.filter(Boolean);

                    if (activeToolCalls.length > 0) {
                        hasToolCalls = true;

                        // Push assistant message with tool calls to context
                        finalMessages.push({
                            role: "assistant",
                            content: accumulatedText,
                            tool_calls: activeToolCalls,
                        });

                        // Execute tool calls sequentially to allow legal yields inside generator
                        const responseMessages = [];
                        for (const tc of activeToolCalls) {
                            const toolCall = tc as any;
                            yield `\n\n⚙️ *Running tool \`${toolCall.function.name}\`...*\n`;

                            try {
                                const args = JSON.parse(toolCall.function.arguments);
                                const result = await mcpClientService.executeTool(toolCall.function.name, args);
                                yield `\n\n✅ *Tool \`${toolCall.function.name}\` completed.* \n\n`;

                                responseMessages.push({
                                    role: "tool" as const,
                                    tool_call_id: tc.id,
                                    content: JSON.stringify(result),
                                });
                            } catch (err: any) {
                                yield `\n\n❌ *Tool \`${toolCall.function.name}\` failed: ${err.message || err}*\n\n`;

                                responseMessages.push({
                                    role: "tool" as const,
                                    tool_call_id: tc.id,
                                    content: JSON.stringify({ error: err.message || String(err) }),
                                });
                            }
                        }

                        // Push tool results to context
                        finalMessages.push(...responseMessages);
                    }
                } else {
                    const stream = await this.openai.chat.completions.create(
                        {
                            model: this.model,
                            messages: finalMessages as any,
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
                }
            }
        } catch (error: any) {
            console.error("NVIDIA generateStreamResponse error:", error);
            throw new AIServiceError(
                error.message ||
                    "Failed to generate stream response from NVIDIA NIM",
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
