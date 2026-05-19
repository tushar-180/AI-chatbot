import { EventEmitter } from "events";
import type { ActiveStream } from "../types/chat.types";

const activeStreams = new Map<string, ActiveStream>();
const activeChatRequests = new Map<string, string>();

export const chatStreamRegistry = {
  create({
    requestId,
    chatId,
    messageId,
    model,
  }: {
    requestId: string;
    chatId: string;
    messageId: string;
    model: string;
  }) {
    const activeStream: ActiveStream = {
      requestId,
      chatId,
      messageId,
      fullResponse: "",
      emitter: new EventEmitter(),
      model,
      status: "streaming",
      abortController: new AbortController(),
    };

    activeStreams.set(requestId, activeStream);
    activeChatRequests.set(chatId, requestId);
    return activeStream;
  },

  get(requestId: string) {
    return activeStreams.get(requestId);
  },

  getByChatId(chatId: string) {
    const requestId = activeChatRequests.get(chatId);
    return requestId ? activeStreams.get(requestId) : undefined;
  },

  updateResponse(requestId: string, fullResponse: string, chunk: string) {
    const activeStream = activeStreams.get(requestId);

    if (!activeStream) return;

    activeStream.fullResponse = fullResponse;
    activeStream.status = "streaming";
    activeStream.emitter.emit("chunk", chunk);
  },

  updateUsage(requestId: string, usage: ActiveStream["usage"]) {
    const activeStream = activeStreams.get(requestId);

    if (!activeStream || !usage) return;

    activeStream.usage = usage;
  },

  complete(requestId: string) {
    const activeStream = activeStreams.get(requestId);

    if (!activeStream) return;

    activeStream.status = "completed";
    activeStream.emitter.emit("done");
    activeStreams.delete(requestId);
    activeChatRequests.delete(activeStream.chatId);
  },

  stop(requestId: string) {
    const activeStream = activeStreams.get(requestId);

    if (!activeStream) return null;

    activeStream.status = "stopped";
    activeStream.abortController.abort();
    activeStream.emitter.emit("done");
    activeStreams.delete(requestId);
    activeChatRequests.delete(activeStream.chatId);
    return activeStream;
  },

  fail(requestId: string, message: string) {
    const activeStream = activeStreams.get(requestId);

    if (!activeStream) return;

    if (activeStream.emitter.listenerCount("error") > 0) {
      activeStream.emitter.emit("error", message);
    }
    activeStreams.delete(requestId);
    activeChatRequests.delete(activeStream.chatId);
  },
};
