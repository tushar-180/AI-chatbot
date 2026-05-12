import { EventEmitter } from "events";

export type Personalization = {
  nickname: string;
  occupation: string;
  tone: string;
  customInstructions: string;
};

export type UserProfile = {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  lastSignInAt?: Date;
  personalization?: Personalization;
};

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessageStatus =
  | "streaming"
  | "stopped"
  | "completed"
  | "failed";
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
  metadata?: Record<string, unknown>;
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
  webSearchEnabled?: boolean;
};

export type SendMessageInput = {
  chatId: string;
  message?: string;
  provider?: string;
  requestId?: string;
  attachments?: Attachment[];
  webSearchEnabled?: boolean;
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
