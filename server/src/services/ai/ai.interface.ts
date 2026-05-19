import { AIMessage, AIResponse, AIStreamResponse } from "./types";

export interface IAIService {
  generateResponse(messages: AIMessage[]): Promise<AIResponse>;
  generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): Promise<AIStreamResponse>;
  getProviderName(): string;
  setModel(model: string): void;
  generateEmbedding(text: string): Promise<number[]>;
}
