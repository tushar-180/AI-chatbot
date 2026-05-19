import { api, API_ORIGIN } from "@/lib/api";
import axios from "axios";
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

  getChatErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const apiMessage =
        typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : undefined;

      if (status === 401 || status === 403) {
        return "Server Error: Authentication failed. Please check API configuration.";
      }

      if (status && status >= 500) {
        return "Server Error: AI failed to respond. Please try again later.";
      }

      return apiMessage || "Server Error: Unable to connect to AI service.";
    }

    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timed out")) {
        return "AI generation timed out. Please try again.";
      }
      return error.message;
    }

    return "Server Error: Something went wrong while sending your message.";
  },
};
