import type { StreamEventPayload } from "@/features/chat/types/chat.types";

/**
 * Parses a raw SSE event string into a typed payload.
 */
export const parseStreamEvent = (
  rawEvent: string,
): StreamEventPayload | null => {
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
};
