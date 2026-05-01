import { AIMessage } from "./types";

export interface IAIService {
  generateResponse(messages: AIMessage[]): Promise<string>;
  generateStreamResponse(messages: AIMessage[]): AsyncIterable<string>;
  getProviderName(): string;
  setModel(model: string): void;
}
