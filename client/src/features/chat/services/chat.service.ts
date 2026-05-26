import { api, API_ORIGIN } from "@/lib/api";
import type {
  Chat,
  Message,
  StreamEventPayload,
} from "@/features/chat/types/chat.types";

export type { Chat, Message };

const normalizeMessage = (
  message: Message & { metadata?: { sources?: Message["sources"] } },
): Message => {
  if (message.sources?.length) {
    return message;
  }

  if (message.metadata?.sources?.length) {
    return {
      ...message,
      sources: message.metadata.sources,
    };
  }

  return message;
};

interface CacheEntry {
  messages: Message[];
  timestamp: number;
}

const messageCache = new Map<string, CacheEntry>();
const inFlightMessageFetches = new Map<string, Promise<Message[]>>();
const CACHE_TTL_MS = 5000; // 5 seconds

export const chatService = {
  /**
   * Fetches all chats for a given user.
   */
  async fetchChats(isArchived: boolean = false): Promise<Chat[]> {
    const res = await api.get("/chat", {
      params: { isArchived },
    });
    return res.data || [];
  },

  /**
   * Fetches messages for a specific chat.
   */
  fetchMessages(chatId: string, forceRefetch = false): Promise<Message[]> {
    if (!forceRefetch) {
      const cached = messageCache.get(chatId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return Promise.resolve(cached.messages);
      }
    }

    let promise = inFlightMessageFetches.get(chatId);
    if (!promise) {
      promise = api
        .get(`/chat/${chatId}`)
        .then((res) => {
          inFlightMessageFetches.delete(chatId);
          const messages = (res.data.messages || []).map(normalizeMessage);
          messageCache.set(chatId, {
            messages,
            timestamp: Date.now(),
          });
          return messages;
        })
        .catch((err) => {
          inFlightMessageFetches.delete(chatId);
          throw err;
        });
      inFlightMessageFetches.set(chatId, promise);
    }
    return promise;
  },

  /**
   * Generates the streaming endpoint URL.
   */
  getStreamUrl(chatId?: string): string {
    const path = chatId ? `/api/chat/${chatId}/stream` : `/api/chat/stream`;
    return `${API_ORIGIN}${path}`;
  },

  /**
   * Generates the streaming endpoint URL for editing a message.
   */
  getEditStreamUrl(chatId: string, messageId: string): string {
    return `${API_ORIGIN}/api/chat/${chatId}/messages/${messageId}/stream`;
  },

  /**
   * Generates the streaming endpoint URL for retrying a message.
   */
  getRetryStreamUrl(chatId: string, messageId: string): string {
    return `${API_ORIGIN}/api/chat/${chatId}/messages/${messageId}/retry/stream`;
  },

  /**
   * Generates the stream updates endpoint URL for recovery.
   */
  getStreamUpdatesUrl(chatId: string): string {
    return `${API_ORIGIN}/api/chat/${chatId}/stream-updates`;
  },

  async stopStream(requestId: string, chatId?: string | null) {
    return api.post("/chat/stop", {
      requestId,
      chatId,
    });
  },

  async updateMessageFeedback(
    chatId: string,
    messageId: string,
    feedback: "like" | "dislike" | null,
  ) {
    return api.patch(`/chat/${chatId}/messages/${messageId}/feedback`, {
      feedback,
    });
  },

  /**
   * Parses a raw SSE event string.
   */
  parseStreamEvent(rawEvent: string): StreamEventPayload | null {
    const event = rawEvent.trim();
    if (!event.startsWith("data: ")) return null;

    const payload = event
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .join("\n");

    if (!payload) return null;

    try {
      return JSON.parse(payload);
    } catch (e) {
      console.error("Error parsing stream event payload", e);
      return null;
    }
  },

  /**
   * Formats API errors for display.
   */
  getChatErrorMessage(_error: unknown): string {
    return `⚠️ **Failed to generate response.** The model encountered an error or is temporarily unavailable. Please try again.`;
  },

  async archiveChat(chatId: string) {
    return api.post(`/chat/${chatId}/archive`);
  },

  async unarchiveChat(chatId: string) {
    return api.post(`/chat/${chatId}/unarchive`);
  },

  async pinChat(chatId: string) {
    return api.post(`/chat/${chatId}/pin`);
  },

  async unpinChat(chatId: string) {
    return api.post(`/chat/${chatId}/unpin`);
  },
};
