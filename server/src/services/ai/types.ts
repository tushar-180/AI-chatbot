import { TokenUsage } from "../../utils/tokenCounter";

export type AIRole = "user" | "assistant" | "system";

export interface AIMessage {
  role: AIRole;
  content: string;
  userId?: string;
  username?: string;
  model?: string;
  attachments?: {
    url: string;
    name?: string;
    mimeType?: string;
  }[];
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  [key: string]: any;
}

export interface AIResponse {
  text: string;
  usage?: TokenUsage;
}

export interface AIStreamResponse extends AsyncIterable<string> {
  usage: Promise<TokenUsage | undefined>;
}

export class AIServiceError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status = 500, retryAfter?: number) {
    super(message);
    this.name = "AIServiceError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
