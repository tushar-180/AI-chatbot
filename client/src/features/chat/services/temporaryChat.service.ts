import { api, API_ORIGIN } from "@/lib/api";
import type { StreamEventPayload } from "@/features/chat/types/chat.types";

export const temporaryChatService = {
  /**
   * Generates the streaming endpoint URL for temporary chat.
   */
  getTemporaryStreamUrl(): string {
    return `${API_ORIGIN}/api/temporary-chat/stream`;
  },

  async stopStream(requestId: string) {
    return api.post("/chat/stop", {
      requestId,
      chatId: `temp_chat_${requestId}`,
    });
  },

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
      console.error("Error parsing temporary stream event payload", e);
      return null;
    }
  },

  getChatErrorMessage(_error: unknown): string {
    return `⚠️ **Failed to generate response.** The model encountered an error or is temporarily unavailable. Please try again.`;
  },
};
