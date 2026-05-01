import { api, API_ORIGIN } from "@/lib/api";
import axios from "axios";
import type {
  Chat,
  Message,
  StreamEventPayload,
} from "@/features/chat/types/chat.types";

export type { Chat, Message };

export const chatService = {
  /**
   * Fetches all chats for a given user.
   */
  async fetchChats(userId: string): Promise<Chat[]> {
    const res = await api.get("/chat", {
      params: { userId },
    });
    return res.data || [];
  },

  /**
   * Fetches messages for a specific chat.
   */
  async fetchMessages(chatId: string): Promise<Message[]> {
    const res = await api.get(`/chat/${chatId}`);
    return res.data.messages || [];
  },

  /**
   * Generates the streaming endpoint URL.
   */
  getStreamUrl(chatId?: string): string {
    const path = chatId ? `/api/chat/${chatId}/stream` : `/api/chat/stream`;
    return `${API_ORIGIN}${path}`;
  },

  /**
   * Generates the stream updates endpoint URL for recovery.
   */
  getStreamUpdatesUrl(chatId: string): string {
    return `${API_ORIGIN}/api/chat/${chatId}/stream-updates`;
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
  getChatErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const apiMessage =
        typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : undefined;
      const retryAfter = error.response?.data?.retryAfter;

      if (apiMessage && retryAfter) {
        return `${apiMessage} Try again in about ${retryAfter} seconds.`;
      }

      return apiMessage || error.message;
    }
    return "Something went wrong while sending your message.";
  },
};
