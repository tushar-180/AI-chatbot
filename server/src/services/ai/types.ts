export type AIRole = "user" | "assistant" | "system";

export interface AIMessage {
  role: AIRole;
  content: string;
  model?: string;
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  [key: string]: any;
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
