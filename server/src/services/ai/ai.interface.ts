import { AIMessage } from "./types";

export interface IAIService {
  generateResponse(messages: AIMessage[]): Promise<string>;
  generateStreamResponse(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string>;
  getProviderName(): string;
  setModel(model: string): void;
}
