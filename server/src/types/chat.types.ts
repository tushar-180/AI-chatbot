import { EventEmitter } from "events";
import { TokenUsage } from "../utils/tokenCounter";

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
  role?: "user" | "admin";
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
  storagePath?: string;
  fileHash: string;
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
  feedback?: "like" | "dislike" | null;
  tokens?: TokenUsage;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateChatInput = {
  userId?: string;
  projectId?: string;
  message?: string;
  provider?: string;
  requestId?: string;
  attachments?: Attachment[];
  webSearchEnabled?: boolean;
  selection?: {
    selectedText: string;
    originalSourceMessage: string;
    sourceMessageId: string;
    actionType: string;
  };
  attachedFile?: Express.Multer.File | null;
};

export type SendMessageInput = {
  chatId: string;
  projectId?: string;
  message?: string;
  provider?: string;
  requestId?: string;
  attachments?: Attachment[];
  webSearchEnabled?: boolean;
  selection?: {
    selectedText: string;
    originalSourceMessage: string;
    sourceMessageId: string;
    actionType: string;
  };
  attachedFile?: Express.Multer.File | null;
};

export type EditMessageInput = {
  chatId: string;
  messageId: string;
  content: string;
  provider?: string;
  requestId?: string;
  attachments?: Attachment[];
  webSearchEnabled?: boolean;
  selection?: {
    selectedText: string;
    originalSourceMessage: string;
    sourceMessageId: string;
    actionType: string;
  };
  attachedFile?: Express.Multer.File | null;
};

export type RetryMessageInput = {
  chatId: string;
  messageId: string;
  provider?: string;
  requestId?: string;
};

export type StopStreamInput = {
  requestId?: string;
  chatId?: string;
};

export type StreamPayload = {
  type?: "message" | "sources";
  chatId?: string;
  messageId?: string;
  requestId?: string;
  model?: string;
  chunk?: string;
  done?: boolean;
  status?: ChatMessageStatus;
  error?: string;
  sources?: {
    id: number;
    url: string;
    title: string;
    hostname: string;
    snippet: string;
  }[];
};

export type ActiveStream = {
  requestId: string;
  chatId: string;
  messageId: string;
  fullResponse: string;
  usage?: TokenUsage;
  emitter: EventEmitter;
  model: string;
  status: ChatMessageStatus;
  abortController: AbortController;
};
