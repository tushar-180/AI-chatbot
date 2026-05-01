import { EventEmitter } from "events";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  model?: string;
};

export type CreateChatInput = {
  userId?: string;
  message?: string;
  provider?: string;
};

export type SendMessageInput = {
  chatId: string;
  message?: string;
  provider?: string;
};

export type StreamPayload = {
  chatId?: string;
  model?: string;
  chunk?: string;
  done?: boolean;
  error?: string;
};

export type ActiveStream = {
  chatId: string;
  fullResponse: string;
  emitter: EventEmitter;
  model: string;
};
