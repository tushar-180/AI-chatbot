import { EventEmitter } from "events";
import type { ActiveStream } from "../types/chat.types";

const activeStreams = new Map<string, ActiveStream>();

export const chatStreamRegistry = {
  create(chatId: string, model: string) {
    const activeStream: ActiveStream = {
      chatId,
      fullResponse: "",
      emitter: new EventEmitter(),
      model,
    };

    activeStreams.set(chatId, activeStream);
    return activeStream;
  },

  get(chatId: string) {
    return activeStreams.get(chatId);
  },

  updateResponse(chatId: string, fullResponse: string, chunk: string) {
    const activeStream = activeStreams.get(chatId);

    if (!activeStream) return;

    activeStream.fullResponse = fullResponse;
    activeStream.emitter.emit("chunk", chunk);
  },

  complete(chatId: string) {
    const activeStream = activeStreams.get(chatId);

    if (!activeStream) return;

    activeStream.emitter.emit("done");
    activeStreams.delete(chatId);
  },

  fail(chatId: string, message: string) {
    const activeStream = activeStreams.get(chatId);

    if (!activeStream) return;

    activeStream.emitter.emit("error", message);
    activeStreams.delete(chatId);
  },
};
