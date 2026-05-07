import type { Message } from "@/features/chat/types/chat.types";

/**
 * Ensures every message has a stable `id`.
 * Server messages may carry `_id` from MongoDB instead of `id`.
 */
export const normalizeMessage = (msg: any): Message => ({
  ...msg,
  id: msg.id || msg._id || crypto.randomUUID(),
});

export const normalizeMessages = (msgs: any[]): Message[] =>
  msgs.map(normalizeMessage);

/**
 * Creates a user message with a guaranteed ID.
 */
export const createUserMessage = (
  content: string,
  provider: string,
  attachments: Message["attachments"] = [],
): Message => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  model: provider,
  status: "completed",
  attachments,
});

/**
 * Creates an assistant placeholder for streaming.
 */
export const createAssistantPlaceholder = (
  provider: string,
  requestId: string,
): Message => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content: "",
  model: provider,
  requestId,
  status: "streaming",
});
