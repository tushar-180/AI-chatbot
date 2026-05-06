import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Chat, Message } from "@/features/chat/types/chat.types";

export const TEMP_CHAT_ID = "__new__";

const createStableId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const ensureMessage = (chatId: string, message: Partial<Message>): Message => {
    return {
        id: message.id ?? message.requestId ?? createStableId(),
        chatId,
        role: message.role!,
        content: message.content ?? "",
        model: message.model,
        requestId: message.requestId,
        status: message.status ?? "completed",
        type: message.type,
        attachments: message.attachments,
    };
};

type ActiveStream = {
    requestId: string | null;
    chatId: string | null;
};

type ChatState = {
    chats: Chat[];
    currentChatId: string | null;

    messagesByChatId: Record<string, Message[]>;

    loading: boolean;
    isStreaming: boolean;
    streamingChatId: string | null;
    streamingMessageId: string | null;

    activeStream: ActiveStream;

    isNewChat: boolean;
    sidebarOpen: boolean;

    // UI
    setSidebarOpen: (open: boolean) => void;

    // chat
    setChats: (chats: Chat[]) => void;
    setCurrentChat: (id: string | null) => void;
    setIsNewChat: (isNew: boolean) => void;

    upsertChat: (chat: Chat) => void;
    removeChat: (id: string) => void;
    updateChatTitle: (id: string, title: string) => void;

    // messages
    setMessages: (chatId: string, messages: Message[]) => void;
    addMessage: (chatId: string, message: Partial<Message>) => void;
    clearMessages: (chatId: string) => void;

    resetCurrentChatMessages: () => void;

    // streaming
    beginStreamingAssistantMessage: (
        chatId: string,
        params: {
            id?: string;
            model?: string;
            requestId?: string;
            content?: string;
        },
    ) => string;

    updateStreamingAssistantMessage: (
        chatId: string,
        params: {
            id?: string;
            content?: string;
            delta?: string;
            model?: string;
            status?: Message["status"];
        },
    ) => void;

    finalizeStreamingMessage: (
        chatId: string,
        params?: {
            id?: string;
            status?: Exclude<Message["status"], "streaming">;
            content?: string;
        },
    ) => void;

    resolveTempChat: (realChatId: string) => void;

    setActiveStream: (stream: ActiveStream) => void;
    clearActiveStream: () => void;

    setIsStreaming: (isStreaming: boolean, chatId?: string | null) => void;
    setLoading: (loading: boolean) => void;
};

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            chats: [],
            currentChatId: null,
            messagesByChatId: {},

            loading: false,
            isStreaming: false,
            streamingChatId: null,
            streamingMessageId: null,

            activeStream: { requestId: null, chatId: null },

            isNewChat: false,
            sidebarOpen: false,

            setSidebarOpen: (open) => set({ sidebarOpen: open }),

            setChats: (chats) => set({ chats }),

            setCurrentChat: (id) =>
                set((state) => {
                    const isNew = !id || id === TEMP_CHAT_ID;
                    return {
                        currentChatId: isNew ? null : id,
                        isNewChat: isNew,
                        messagesByChatId: isNew
                            ? { ...state.messagesByChatId, [TEMP_CHAT_ID]: [] }
                            : state.messagesByChatId,
                    };
                }),

            setIsNewChat: (isNew) =>
                set((state) => ({
                    isNewChat: isNew,
                    currentChatId: isNew ? null : state.currentChatId,
                    messagesByChatId: isNew
                        ? { ...state.messagesByChatId, [TEMP_CHAT_ID]: [] }
                        : state.messagesByChatId,
                })),

            upsertChat: (chat) =>
                set((state) => {
                    const index = state.chats.findIndex(
                        (c) => c._id === chat._id,
                    );

                    if (index === -1) {
                        return { chats: [chat, ...state.chats] };
                    }

                    const updated = [...state.chats];
                    updated[index] = { ...updated[index], ...chat };

                    return { chats: updated };
                }),

            removeChat: (id) =>
                set((state) => {
                    const newMessages = { ...state.messagesByChatId };
                    delete newMessages[id];

                    const isDeletingCurrent = state.currentChatId === id;

                    return {
                        chats: state.chats.filter((c) => c._id !== id),
                        currentChatId: isDeletingCurrent
                            ? null
                            : state.currentChatId,
                        isNewChat: isDeletingCurrent ? true : state.isNewChat,
                        messagesByChatId: newMessages,
                    };
                }),

            updateChatTitle: (id, title) =>
                set((state) => ({
                    chats: state.chats.map((c) =>
                        c._id === id ? { ...c, title } : c,
                    ),
                })),

            setMessages: (chatId, messages) =>
                set((state) => ({
                    messagesByChatId: {
                        ...state.messagesByChatId,
                        [chatId]: messages.map((m) => ensureMessage(chatId, m)),
                    },
                })),

            addMessage: (chatId, message) =>
                set((state) => ({
                    messagesByChatId: {
                        ...state.messagesByChatId,
                        [chatId]: [
                            ...(state.messagesByChatId[chatId] || []),
                            ensureMessage(chatId, message),
                        ],
                    },
                })),

            clearMessages: (chatId) =>
                set((state) => ({
                    messagesByChatId: {
                        ...state.messagesByChatId,
                        [chatId]: [],
                    },
                })),

            resetCurrentChatMessages: () =>
                set((state) => {
                    const id = state.currentChatId ?? TEMP_CHAT_ID;
                    return {
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [id]: [],
                        },
                    };
                }),

            beginStreamingAssistantMessage: (chatId, params) => {
                const id = params.id ?? params.requestId ?? createStableId();

                set((state) => {
                    const messages = state.messagesByChatId[chatId] || [];

                    const next = ensureMessage(chatId, {
                        id,
                        role: "assistant",
                        content: params.content ?? "",
                        model: params.model,
                        requestId: params.requestId,
                        status: "streaming",
                    });

                    return {
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [chatId]: [...messages, next],
                        },
                        streamingMessageId: id,
                        streamingChatId: chatId,
                    };
                });

                return id;
            },

            updateStreamingAssistantMessage: (chatId, params) =>
                set((state) => {
                    if (state.streamingChatId && state.streamingChatId !== chatId) {
                        return state;
                    }

                    const messages = state.messagesByChatId[chatId] || [];
                    const id = params.id ?? state.streamingMessageId;

                    if (!id) return state;

                    const index = messages.findIndex((m) => m.id === id);
                    if (index === -1) return state;

                    const updated = [...messages];
                    updated[index] = {
                        ...messages[index],
                        content:
                            params.content ??
                            (params.delta
                                ? messages[index].content + params.delta
                                : messages[index].content),
                        status: params.status ?? messages[index].status,
                        model: params.model ?? messages[index].model,
                    };

                    return {
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [chatId]: updated,
                        },
                    };
                }),

            finalizeStreamingMessage: (chatId, params) =>
                set((state) => {
                    const messages = state.messagesByChatId[chatId] || [];
                    const id = params?.id ?? state.streamingMessageId;

                    if (!id) return state;

                    const index = messages.findIndex((m) => m.id === id);
                    if (index === -1) return state;

                    const updated = [...messages];
                    updated[index] = {
                        ...messages[index],
                        status: params?.status ?? "completed",
                        content: params?.content ?? messages[index].content,
                    };

                    return {
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [chatId]: updated,
                        },
                        streamingMessageId: null,
                        streamingChatId: null,
                    };
                }),

            resolveTempChat: (realChatId) =>
                set((state) => {
                    const tempMessages = state.messagesByChatId[TEMP_CHAT_ID];
                    if (!tempMessages || tempMessages.length === 0) return state;

                    return {
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [realChatId]: tempMessages.map((m) => ({
                                ...m,
                                chatId: realChatId,
                            })),
                            [TEMP_CHAT_ID]: [],
                        },
                        currentChatId: realChatId,
                        isNewChat: false,
                    };
                }),

            setActiveStream: (stream) => set({ activeStream: stream }),

            clearActiveStream: () =>
                set({ activeStream: { requestId: null, chatId: null } }),

            setIsStreaming: (isStreaming, chatId) =>
                set({
                    isStreaming,
                    streamingChatId: isStreaming ? (chatId ?? null) : null,
                }),

            setLoading: (loading) => set({ loading }),
        }),
        {
            name: "chat-storage",
            partialize: (state) => {
                const chatIds = new Set(state.chats.map((c) => c._id));
                const persistedMessagesByChatId: Record<string, Message[]> = {};

                Object.entries(state.messagesByChatId).forEach(([id, msgs]) => {
                    if (id !== TEMP_CHAT_ID && chatIds.has(id)) {
                        persistedMessagesByChatId[id] = msgs;
                    }
                });

                return {
                    chats: state.chats,
                    currentChatId: state.currentChatId,
                    messagesByChatId: persistedMessagesByChatId,
                };
            },
        },
    ),
);
