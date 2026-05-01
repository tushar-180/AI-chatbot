import { GoogleGenAI } from "@google/genai";
import { IAIService } from "../ai.interface";
import { AIMessage, AIServiceError } from "../types";
import { AI_PROVIDERS, getDisplayProviderName } from "../constants";
import dotenv from "dotenv";

dotenv.config();

export class GeminiAdapter implements IAIService {
  private ai: GoogleGenAI;
  private model: string;

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

  async generateResponse(messages: AIMessage[]): Promise<string> {
    const contents = messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

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

  async *generateStreamResponse(messages: AIMessage[]): AsyncIterable<string> {
    const contents = messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

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
            : undefined, // Default system instruction is already in the class logic, but here we can keep it simple or repeat it
        },
      });

      for await (const chunk of res) {
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
}
