import type { AIMessage, AIResponse, AIStreamResponse } from "./ai.types";

export interface IAIService {
  generateResponse(messages: AIMessage[], tools?: any[]): Promise<AIResponse>;
  generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
    tools?: any[],
  ): Promise<AIStreamResponse>;
  getProviderName(): string;
  setModel(model: string): void;
  generateEmbedding(text: string): Promise<number[]>;
}
