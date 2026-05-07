import { create } from "zustand";

export type StreamStatus = {
  isStreaming: boolean;
  requestId?: string;
  status?: "streaming" | "stopped" | "completed" | "failed";
  abortController?: AbortController;
};

type StreamStoreState = {
  streamsByChatId: Record<string, StreamStatus>;

  setStreamStatus: (chatId: string, status: Partial<StreamStatus>) => void;
  removeStream: (chatId: string) => void;
  abortStream: (chatId: string) => void;
};

export const useStreamStore = create<StreamStoreState>((set, get) => ({
  streamsByChatId: {},

  setStreamStatus: (chatId, status) =>
    set((state) => ({
      streamsByChatId: {
        ...state.streamsByChatId,
        [chatId]: {
          ...(state.streamsByChatId[chatId] || { isStreaming: false }),
          ...status,
        },
      },
    })),

  removeStream: (chatId) =>
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [chatId]: _, ...rest } = state.streamsByChatId;
      return { streamsByChatId: rest };
    }),

  abortStream: (chatId) => {
    const stream = get().streamsByChatId[chatId];
    if (stream?.abortController) {
      stream.abortController.abort();
    }
    get().setStreamStatus(chatId, {
      isStreaming: false,
      status: "stopped",
      abortController: undefined,
    });
  },
}));
