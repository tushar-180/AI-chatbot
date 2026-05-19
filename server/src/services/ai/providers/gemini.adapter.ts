import { GoogleGenAI } from "@google/genai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import {
  AI_PROVIDERS,
  getDisplayProviderName,
  supportsVision,
} from "../constants";
import dotenv from "dotenv";
import { mcpClientService } from "../../mcpClient.service";

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
        Object.entries(schema.properties).map(([k, propSchema]: [string, any]) => [
          k,
          this.mapJsonSchemaToGemini(propSchema)
        ])
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

    return [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description || "",
        parameters: this.mapJsonSchemaToGemini(t.inputSchema) || {
          type: "OBJECT",
          properties: {},
          required: []
        }
      })),
    }];
  }

  async generateResponse(messages: AIMessage[], tools?: any[]): Promise<string> {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const collapsedMessages = this.collapseConsecutiveRoles(messages);
    const contents = await this.formatContents(collapsedMessages);

    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    let hasToolCalls = true;
    let loopCount = 0;
    const maxLoops = 10;
    let finalOutput = "";

    try {
      while (hasToolCalls && loopCount < maxLoops) {
        loopCount++;
        hasToolCalls = false;

        const config: any = {
          systemInstruction: this.getSystemInstruction(combinedSystemPrompt),
        };

        const geminiTools = this.mapMcpToolsToGemini(tools);
        if (geminiTools) {
          config.tools = geminiTools;
        }

        const res = await this.ai.models.generateContent({
          model: this.model,
          contents,
          config,
        });

        const text = res?.candidates?.[0]?.content?.parts?.[0]?.text || res?.text || "";
        if (text) {
          finalOutput += text;
        }

        const fc = res.functionCalls;
        if (fc && fc.length > 0) {
          hasToolCalls = true;

          // Record model turn in context (preserving all parts like thought_signature!)
          const modelContent = res.candidates?.[0]?.content;
          contents.push({
            role: "model",
            parts: modelContent?.parts && modelContent.parts.length > 0
              ? modelContent.parts
              : fc.map((f) => ({
                  functionCall: {
                    name: f.name,
                    args: f.args,
                  },
                })),
          } as any);

          // Execute tool calls
          const responseParts = await Promise.all(
            fc.map(async (f) => {
              try {
                const result = await mcpClientService.executeTool(f.name!, f.args);
                return {
                  functionResponse: {
                    name: f.name!,
                    response: { result },
                  },
                };
              } catch (err: any) {
                return {
                  functionResponse: {
                    name: f.name!,
                    response: { error: err.message || String(err) },
                  },
                };
              }
            })
          );

          // Record user turn with tool response in context
          contents.push({
            role: "user",
            parts: responseParts,
          } as any);
        }
      }

      return finalOutput.trim() || "No response generated.";
    } catch (error: any) {
      console.error("Gemini Adapter Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async *generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
    tools?: any[],
  ): AsyncIterable<string> {
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const collapsedMessages = this.collapseConsecutiveRoles(messages);
    const contents = await this.formatContents(collapsedMessages);

    const combinedSystemPrompt = systemMessages
      .map((msg) => msg.content)
      .join("\n\n---\n\n");

    let streamedText = "";
    let hasToolCalls = true;
    let loopCount = 0;
    const maxLoops = 10;

    try {
      while (hasToolCalls && loopCount < maxLoops) {
        loopCount++;
        hasToolCalls = false;

        const config: any = {
          systemInstruction: this.getSystemInstruction(combinedSystemPrompt),
        };

        const geminiTools = this.mapMcpToolsToGemini(tools);
        if (geminiTools) {
          config.tools = geminiTools;
        }

        const res = await this.ai.models.generateContentStream({
          model: this.model,
          contents,
          config,
        } as any);

        const activeFunctionCalls: any[] = [];
        const accumulatedParts: any[] = [];

        for await (const chunk of res) {
          if (signal?.aborted) {
            return;
          }
          const text = chunk.text;
          if (text) {
            streamedText += text;
            yield text;
          }

          const parts = chunk.candidates?.[0]?.content?.parts;
          if (parts && parts.length > 0) {
            accumulatedParts.push(...parts);
          }

          const fc = chunk.functionCalls;
          if (fc && fc.length > 0) {
            activeFunctionCalls.push(...fc);
          }
        }

        if (activeFunctionCalls.length > 0) {
          hasToolCalls = true;

          // Record model turn in context (preserving all parts like thought_signature!)
          contents.push({
            role: "model",
            parts: accumulatedParts.length > 0 
              ? accumulatedParts 
              : activeFunctionCalls.map((f) => ({
                  functionCall: {
                    name: f.name,
                    args: f.args,
                  },
                })),
          } as any);

          // Execute tool calls sequentially to allow legal yields inside generator
          const responseParts = [];
          for (const f of activeFunctionCalls) {
            if (!f.name) continue;

            yield `\n\n⚙️ *Running tool \`${f.name}\`...*\n`;

            try {
              const result = await mcpClientService.executeTool(f.name, f.args);
              yield `\n\n✅ *Tool \`${f.name}\` completed.* \n\n`;

              responseParts.push({
                functionResponse: {
                  name: f.name,
                  response: { result },
                },
              });
            } catch (err: any) {
              yield `\n\n❌ *Tool \`${f.name}\` failed: ${err.message || err}*\n\n`;

              responseParts.push({
                functionResponse: {
                  name: f.name,
                  response: { error: err.message || String(err) },
                },
              });
            }
          }

          // Record user turn with tool response in context
          contents.push({
            role: "user",
            parts: responseParts,
          } as any);
        }
      }
    } catch (error: any) {
      if (signal?.aborted) {
        return;
      }

      console.error("Gemini Adapter Stream Error:", error);

      if (streamedText) {
        return;
      }

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
          yield text.trim();
          return;
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
