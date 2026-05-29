import { EventEmitter } from "events";
import type { ActiveStream } from "../../types/chat.types";

export interface ActiveGroupStream {
  groupId: string;
  tempId: string;
  assistantUsername: string;
  fullResponse: string;
  webSearchEnabled: boolean;
  model: string;
  requesterId?: string;
  abortController: AbortController;
  promptMessages?: any[];
  targetProvider?: string;
  clerkId?: string;
}

const activeStreams = new Map<string, ActiveStream>();
const activeChatRequests = new Map<string, string>();
const stoppedRequestIds = new Set<string>();

const activeGroupStreams = new Map<string, ActiveGroupStream>();

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
    if (stoppedRequestIds.has(requestId)) {
      const activeStream: ActiveStream = {
        requestId,
        chatId,
        messageId,
        fullResponse: "",
        emitter: new EventEmitter(),
        model,
        status: "stopped",
        abortController: new AbortController(),
      };
      activeStream.abortController.abort();
      return activeStream;
    }

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
    stoppedRequestIds.add(requestId);
    setTimeout(() => {
      stoppedRequestIds.delete(requestId);
    }, 60000);

    const activeStream = activeStreams.get(requestId);
    if (!activeStream) return null;

    activeStream.status = "stopped";
    activeStream.abortController.abort();
    activeStream.emitter.emit("done");
    activeStreams.delete(requestId);
    activeChatRequests.delete(activeStream.chatId);
    return activeStream;
  },

  isStopped(requestId: string): boolean {
    return stoppedRequestIds.has(requestId);
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

export const groupStreamRegistry = {
  create({
    groupId,
    tempId,
    assistantUsername,
    webSearchEnabled,
    promptMessages,
    targetProvider,
    clerkId,
  }: {
    groupId: string;
    tempId: string;
    assistantUsername: string;
    webSearchEnabled: boolean;
    promptMessages?: any[];
    targetProvider?: string;
    clerkId?: string;
  }) {
    const activeStream: ActiveGroupStream = {
      groupId,
      tempId,
      assistantUsername,
      fullResponse: "",
      webSearchEnabled,
      model: targetProvider || "",
      requesterId: clerkId,
      abortController: new AbortController(),
      promptMessages,
      targetProvider,
      clerkId,
    };

    activeGroupStreams.set(groupId, activeStream);
    return activeStream;
  },

  get(groupId: string) {
    return activeGroupStreams.get(groupId);
  },

  updateResponse(groupId: string, fullResponse: string) {
    const activeStream = activeGroupStreams.get(groupId);
    if (activeStream) {
      activeStream.fullResponse = fullResponse;
    }
  },

  stop(groupId: string) {
    const activeStream = activeGroupStreams.get(groupId);
    if (!activeStream) return null;

    activeStream.abortController.abort();
    activeGroupStreams.delete(groupId);
    return activeStream;
  },

  delete(groupId: string) {
    activeGroupStreams.delete(groupId);
  },
};
