import { MAX_HISTORY_MESSAGES } from "../constants/chat.constants";
import type { ChatMessage } from "../types/chat.types";

export const getLimitedMessages = (messages: ChatMessage[]): ChatMessage[] => {
  return messages.slice(-MAX_HISTORY_MESSAGES);
};
