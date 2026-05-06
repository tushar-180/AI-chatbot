import { GoogleGenAI } from "@google/genai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import { AI_PROVIDERS, getDisplayProviderName, supportsVision } from "../constants";
import dotenv from "dotenv";

dotenv.config();

export class GeminiAdapter implements IAIService {
  private ai: GoogleGenAI;
  private model: string;
  private static imageCache = new Map<string, { data: string; mimeType: string }>();

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

                    const response = await fetch(att.url);
                    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                    
                    const arrayBuffer = await response.arrayBuffer();
                    const base64Data = Buffer.from(arrayBuffer).toString('base64');
                    const mimeType = att.mimeType || response.headers.get('content-type') || 'image/jpeg';
                    
                    const data = { mimeType, data: base64Data };
                    GeminiAdapter.imageCache.set(att.url, data);
                    
                    return { inlineData: data };
                  } catch (err) {
                    console.error(`Failed to process image: ${att.url}`, err);
                    return { text: `\n[Image unavailable: ${att.url}]` };
                  }
                })
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
        })
    );
  }

  async generateResponse(messages: AIMessage[]): Promise<string> {
    const contents = await this.formatContents(messages);

    const systemMessage = messages.find((msg) => msg.role === "system");

    try {
      const res = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemMessage
            ? {
                parts: [{ text: systemMessage.content }],
              }
            : {
                parts: [
                  {
                    text: `
You are a professional AI developer assistant.

OUTPUT RULES (VERY IMPORTANT):

1. Always format responses using clean Markdown.

2. For code:
   - ALWAYS use triple backticks
   - ALWAYS specify language
   - Never return raw code without code blocks

3. Supported languages: js, ts, json, bash, html, css.

4. Inline code: Use single backticks.

5. Structure responses: Use headings (##, ###), bullet points, and clean spacing.

6. Code quality: Proper indentation and clean formatting.

7. Do NOT: wrap full response in a code block or output broken markdown.

8. When explaining code: Give explanation first, then the code block.

9. Keep responses: Clean, developer-friendly, and easy to read.
      `,
                  },
                ],
              },
        },
      });

      const text =
        res?.candidates?.[0]?.content?.parts?.[0]?.text || res?.text || "";

      return text.trim() || "No response generated.";
    } catch (error: any) {
      console.error("Gemini Adapter Error:", error);
      throw new AIServiceError(error.message, error.status || 500);
    }
  }

  async *generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const contents = await this.formatContents(messages);

    const systemMessage = messages.find((msg) => msg.role === "system");

    try {
      const res = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemMessage
            ? {
                parts: [{ text: systemMessage.content }],
              }
            : {
                parts: [
                  {
                    text: "You are a professional AI developer assistant. Always format responses using clean Markdown and appropriate code blocks.",
                  },
                ],
              },
        },
      } as any);

      for await (const chunk of res) {
        if (signal?.aborted) {
          return;
        }
        const text = chunk.text;
        if (text) {
          yield text;
        }
      }
    } catch (error: any) {
      console.error("Gemini Adapter Stream Error:", error);
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
      console.error(`Gemini Embedding Error (Retries left: ${retries}):`, error);
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s
        return this.generateEmbedding(text, retries - 1);
      }
      return [];
    }
  }
}
