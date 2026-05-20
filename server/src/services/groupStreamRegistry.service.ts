import { EventEmitter } from "events";

export interface ActiveGroupStream {
  groupId: string;
  tempId: string;
  assistantUsername: string;
  fullResponse: string;
  webSearchEnabled: boolean;
  abortController: AbortController;
}

const activeGroupStreams = new Map<string, ActiveGroupStream>();

export const groupStreamRegistry = {
  create({
    groupId,
    tempId,
    assistantUsername,
    webSearchEnabled,
  }: {
    groupId: string;
    tempId: string;
    assistantUsername: string;
    webSearchEnabled: boolean;
  }) {
    const activeStream: ActiveGroupStream = {
      groupId,
      tempId,
      assistantUsername,
      fullResponse: "",
      webSearchEnabled,
      abortController: new AbortController(),
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
