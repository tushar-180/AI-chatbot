import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message } from "@/features/chat/types/chat.types";
import { normalizeMessages } from "@/features/chat/utils/message.utils";
import { useStreamStore } from "./stream.store";

type MessageStoreState = {
  messagesByChatId: Record<string, Message[]>;
  lastFetchedAt: Record<string, number>;
  isRefreshing: Record<string, boolean>;

  setMessages: (chatId: string, messages: Message[]) => void;
  reconcileMessages: (chatId: string, incomingMessages: Message[]) => void;
  setIsRefreshing: (chatId: string, refreshing: boolean) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updater: (msg: Message) => Message,
  ) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  clearMessages: (chatId: string) => void;
  removeChatMessages: (chatId: string) => void;
};

export const useMessageStore = create<MessageStoreState>()(
  persist(
    (set) => ({
      messagesByChatId: {},
      lastFetchedAt: {},
      isRefreshing: {},

      setIsRefreshing: (chatId, refreshing) =>
        set((state) => ({
          isRefreshing: { ...state.isRefreshing, [chatId]: refreshing },
        })),

      setMessages: (chatId, messages) =>
        set((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: normalizeMessages(messages),
          },
          lastFetchedAt: {
            ...state.lastFetchedAt,
            [chatId]: Date.now(),
          },
        })),

      reconcileMessages: (chatId, incomingMessages) => {
        const isStreaming = useStreamStore.getState().streamsByChatId[chatId]?.isStreaming;
        if (isStreaming) {
          // Never overwrite an actively streaming chat. The stream is the source of truth for now.
          set((state) => ({
            lastFetchedAt: { ...state.lastFetchedAt, [chatId]: Date.now() },
          }));
          return;
        }

        set((state) => {
          const currentMessages = state.messagesByChatId[chatId] || [];
          const normalizedIncoming = normalizeMessages(incomingMessages);

          let hasChanges = false;
          
          if (currentMessages.length !== normalizedIncoming.length) {
            hasChanges = true;
          }

          const reconciled = normalizedIncoming.map((incomingMsg, i) => {
            const currentMsg = currentMessages[i];
            
            // Structural sharing: if the message hasn't changed structurally, keep the old reference
            if (
              currentMsg &&
              currentMsg.id === incomingMsg.id &&
              currentMsg.content === incomingMsg.content &&
              currentMsg.role === incomingMsg.role &&
              currentMsg.model === incomingMsg.model
            ) {
              return currentMsg;
            }

            hasChanges = true;
            return incomingMsg;
          });

          if (!hasChanges) {
             return {
                lastFetchedAt: { ...state.lastFetchedAt, [chatId]: Date.now() },
             };
          }

          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: reconciled,
            },
            lastFetchedAt: {
              ...state.lastFetchedAt,
              [chatId]: Date.now(),
            },
          };
        });
      },

      addMessage: (chatId, message) =>
        set((state) => {
          const current = state.messagesByChatId[chatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [...current, message],
            },
          };
        }),

      updateMessage: (chatId, messageId, updater) =>
        set((state) => {
          const current = state.messagesByChatId[chatId] || [];
          const index = current.findIndex((m) => m.id === messageId);
          if (index === -1) return state;

          const updated = [...current];
          updated[index] = updater(updated[index]);

          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            },
          };
        }),

      removeMessage: (chatId, messageId) =>
        set((state) => {
          const current = state.messagesByChatId[chatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: current.filter((m) => m.id !== messageId),
            },
          };
        }),

      clearMessages: (chatId) =>
        set((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: [],
          },
        })),

      removeChatMessages: (chatId) =>
        set((state) => {
          const { [chatId]: _, ...rest } = state.messagesByChatId;
          return { messagesByChatId: rest };
        }),
    }),
    {
      name: "chat-messages-store",
      partialize: (state) => ({
        messagesByChatId: state.messagesByChatId,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
