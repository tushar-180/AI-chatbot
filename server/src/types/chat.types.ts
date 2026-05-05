import { EventEmitter } from "events";

export type ChatRole = "user" | "assistant";
export type ChatMessageStatus = "streaming" | "stopped" | "completed";

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  model?: string;
  requestId?: string;
  status: ChatMessageStatus;
};

export type CreateChatInput = {
  userId?: string;
  message?: string;
  provider?: string;
  requestId?: string;
};

export type SendMessageInput = {
  chatId: string;
  message?: string;
  provider?: string;
  requestId?: string;
};

export type StopStreamInput = {
  requestId?: string;
  chatId?: string;
};

export type StreamPayload = {
  chatId?: string;
  requestId?: string;
  model?: string;
  chunk?: string;
  done?: boolean;
  status?: ChatMessageStatus;
  error?: string;
};

export type ActiveStream = {
  requestId: string;
  chatId: string;
  messageId: string;
  fullResponse: string;
  emitter: EventEmitter;
  model: string;
  status: ChatMessageStatus;
  abortController: AbortController;
};
