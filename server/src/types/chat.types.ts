import { EventEmitter } from "events";

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessageStatus = "streaming" | "stopped" | "completed" | "failed";
export type ChatMessageType = "text" | "image" | "file" | "action";

export type Attachment = {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

export type ChatMessage = {
  id?: string;
  userId?: string;
  role: ChatRole;
  content: string;
  type?: ChatMessageType;
  metadata?: any;
  attachments?: Attachment[];
  model?: string;
  requestId?: string;
  status: ChatMessageStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateChatInput = {
  userId?: string;
  message?: string;
  provider?: string;
  requestId?: string;
  attachments?: Attachment[];
};

export type SendMessageInput = {
  chatId: string;
  message?: string;
  provider?: string;
  requestId?: string;
  attachments?: Attachment[];
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
