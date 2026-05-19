import { AIMessage } from "./types";

export interface IAIService {
  generateResponse(messages: AIMessage[], tools?: any[]): Promise<string>;
  generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
    tools?: any[],
  ): AsyncIterable<string>;
  getProviderName(): string;
  setModel(model: string): void;
  generateEmbedding(text: string): Promise<number[]>;
}
