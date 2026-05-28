import { useCallback, useEffect, useRef, useState } from "react";
import { useUser, useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useProjectStore } from "../store/useProjectStore";
import {
  chatService,
  type Message,
} from "@/features/chat/services/chat.service";
import { CHAT_TITLE_MAX_LENGTH } from "@/features/chat/constants/chat.constants";
import { toast } from "sonner";
import type { Attachment, WebSource } from "../types/chat.types";

const NEW_CHAT_STREAM_KEY = "__new_chat_stream__";

const getActiveChatKey = (chatId: string | null) =>
  chatId ?? NEW_CHAT_STREAM_KEY;

const createOptimisticTitle = (input: string) =>
  input.trim().slice(0, CHAT_TITLE_MAX_LENGTH) || "New Chat";

const activeAbortControllersRef: { current: Record<string, AbortController | null> } = { current: {} };
const connectionTimeoutsRef: { current: Record<string, ReturnType<typeof setTimeout> | null> } = { current: {} };
const activeRequestIdsRef: { current: Record<string, string | null> } = { current: {} };
const activeResolvedChatIdsRef: { current: Record<string, string | null> } = { current: {} };
const stopRequestedRef: { current: Record<string, boolean> } = { current: {} };
const pendingOptimisticUpdateRef: {
  current: Record<string, { messageId: string; partialMessage: Partial<Message> }>;
} = { current: {} };
const pendingOptimisticFrameRef: { current: number | null } = { current: null };

export const useChatStream = (hookOptions?: {
  onWebSearchComplete?: () => void;
}) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const currentChatId = useChatStore((state) => state.currentChatId);
  const storeMessages = useChatStore((state) => state.messages);
  const streamingChatIds = useChatStore((state) => state.streamingChatIds);
  const loadingChatIds = useChatStore((state) => state.loadingChatIds);
  const setCurrentChat = useChatStore((state) => state.setCurrentChat);
  const setChats = useChatStore((state) => state.setChats);
  const setIsNewChat = useChatStore((state) => state.setIsNewChat);
  const upsertChat = useChatStore((state) => state.upsertChat);
  const setMessages = useChatStore((state) => state.setMessages);
  const setIsStreaming = useChatStore((state) => state.setIsStreaming);
  const setLoading = useChatStore((state) => state.setLoading);
  const removeChat = useChatStore((state) => state.removeChat);

  const [optimisticMessagesByChatId, setOptimisticMessagesByChatId] = useState<
    Record<string, Message[] | null>
  >({});
  const resumeAttemptedChatIdRef = useRef<string | null>(null);
  const previousChatIdRef = useRef<string | null>(currentChatId);
  const resumeStreamRef = useRef<(chatId: string) => Promise<boolean>>(
    async () => false,
  );

  const flushOptimisticUpdates = () => {
    pendingOptimisticFrameRef.current = null;

    const pendingUpdates = pendingOptimisticUpdateRef.current;
    if (!Object.keys(pendingUpdates).length) return;

    setOptimisticMessagesByChatId((current) => {
      let next = current;

      for (const key of Object.keys(pendingUpdates)) {
        const pending = pendingUpdates[key];
        const messagesForChat = next[key];

        if (!messagesForChat?.length) continue;

        const lastMessage = messagesForChat[messagesForChat.length - 1];
        if (!lastMessage || lastMessage.id !== pending.messageId) continue;

        const updatedMessages = [...messagesForChat];
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          ...pending.partialMessage,
        };

        next = {
          ...next,
          [key]: updatedMessages,
        };
      }

      return next;
    });

    pendingOptimisticUpdateRef.current = {};
  };

  const scheduleOptimisticFlush = () => {
    if (pendingOptimisticFrameRef.current !== null) return;
    pendingOptimisticFrameRef.current = requestAnimationFrame(
      flushOptimisticUpdates,
    );
  };

  const queueOptimisticMessageUpdate = (
    key: string,
    messageId: string,
    partialMessage: Partial<Message>,
  ) => {
    const existing = pendingOptimisticUpdateRef.current[key];

    pendingOptimisticUpdateRef.current[key] = {
      messageId,
      partialMessage: {
        ...existing?.partialMessage,
        ...partialMessage,
      },
    };

    scheduleOptimisticFlush();
  };
  const setOptimisticMessagesForChat = useCallback(
    (chatId: string | null, next: Message[] | null) => {
      const key = getActiveChatKey(chatId);
      setOptimisticMessagesByChatId((current) => ({
        ...current,
        [key]: next,
      }));
    },
    [],
  );
  const isStreamingCurrentChat =
    streamingChatIds[getActiveChatKey(currentChatId)] === true;
  const isLoadingCurrentChat =
    loadingChatIds[getActiveChatKey(currentChatId)] === true;

  // Clear stale optimistic messages only when the selected chat actually changes.
  useEffect(() => {
    if (previousChatIdRef.current === currentChatId) return;

    const chatIdToClear = currentChatId;
    previousChatIdRef.current = currentChatId;

    if (!chatIdToClear) {
      // Clear the temporary new chat stream state when transitioning back to '/chat'
      setOptimisticMessagesForChat(null, null);
      return;
    }

    queueMicrotask(() => {
      const { streamingChatIds } = useChatStore.getState();
      if (streamingChatIds[getActiveChatKey(chatIdToClear)]) return;
      setOptimisticMessagesForChat(chatIdToClear, null);
    });
  }, [currentChatId, setOptimisticMessagesForChat]);

  // Automatically clear temporary new chat stream state if we are back on '/chat',
  // we are not actively streaming or loading, and the store's messages array is empty (e.g. from createChat).
  useEffect(() => {
    if (
      currentChatId === null &&
      !isStreamingCurrentChat &&
      !isLoadingCurrentChat &&
      storeMessages.length === 0
    ) {
      setOptimisticMessagesForChat(null, null);
    }
  }, [
    currentChatId,
    isStreamingCurrentChat,
    isLoadingCurrentChat,
    storeMessages.length,
    setOptimisticMessagesForChat,
  ]);

  const refreshChats = async () => {
    const chats = await chatService.fetchChats();
    setChats(chats);
  };

  const commitMessagesForChat = (
    chatId: string | null,
    nextMessages: Message[],
  ) => {
    if (useChatStore.getState().currentChatId === chatId) {
      setMessages(nextMessages);
    }
    setOptimisticMessagesForChat(chatId, nextMessages);
  };

  const markAssistantMessageStatus = (
    chatId: string | null,
    requestId: string,
    status: NonNullable<Message["status"]>,
  ) => {
    const key = getActiveChatKey(chatId);

    setOptimisticMessagesByChatId((current) => {
      const messagesForChat =
        current[key] ??
        (useChatStore.getState().currentChatId === chatId
          ? useChatStore.getState().messages
          : []);

      if (!messagesForChat.length) return current;

      const assistantIndex = messagesForChat.findLastIndex(
        (message) =>
          message.role === "assistant" &&
          (!message.requestId || message.requestId === requestId),
      );

      if (assistantIndex === -1) return current;

      const next = [...messagesForChat];
      next[assistantIndex] = {
        ...next[assistantIndex],
        requestId,
        status,
      };

      queueMicrotask(() => {
        commitMessagesForChat(chatId, next);
      });

      return { ...current, [key]: next };
    });
  };

  const loadMessagesForResume = async (chatId: string) => {
    const fallbackMessages =
      useChatStore.getState().currentChatId === chatId
        ? useChatStore.getState().messages
        : [];

    try {
      if (!user?.id) {
        return fallbackMessages;
      }

      const fetchedMessages = await chatService.fetchMessages(chatId);
      if (useChatStore.getState().currentChatId === chatId) {
        setMessages(fetchedMessages);
      }
      return fetchedMessages;
    } catch (err) {
      console.error("Error loading messages before stream resume", err);
      return fallbackMessages;
    }
  };

  const buildResumeMessages = (
    baseMessages: Message[],
    assistantPlaceholder: Message,
  ): { nextMessages: Message[]; targetMessageId: string } => {
    const lastMessage = baseMessages[baseMessages.length - 1];
    const hasPersistedStreamingAssistant =
      lastMessage?.role === "assistant" &&
      (lastMessage.status === "streaming" || !lastMessage.content);

    if (!hasPersistedStreamingAssistant) {
      return {
        nextMessages: [...baseMessages, assistantPlaceholder],
        targetMessageId: assistantPlaceholder.id!,
      };
    }

    const nextMessages = [...baseMessages];
    nextMessages[nextMessages.length - 1] = {
      ...lastMessage,
      model: lastMessage.model ?? assistantPlaceholder.model,
      requestId: lastMessage.requestId ?? assistantPlaceholder.requestId,
      status: "streaming",
    };
    return {
      nextMessages,
      targetMessageId: lastMessage.id!,
    };
  };

  const processStream = async (
    response: Response,
    isCreatingChat: boolean,
    initialChatId: string | null,
    requestId: string,
    placeholderMessageId: string,
    optimisticTitle?: string,
  ) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let resolvedChatId = initialChatId;
    let activeRequestId = requestId;
    const initialKey = getActiveChatKey(initialChatId);
    let hasUpsertedSidebar = false;
    let pendingChatPayload: any = null;

    if (!reader) throw new Error("Stream reader unavailable");

    const processEvent = async (rawEvent: string) => {
      const data = chatService.parseStreamEvent(rawEvent);
      if (!data) return;

      if (data.requestId) {
        activeRequestId = data.requestId;
        activeRequestIdsRef.current[resolvedChatId ?? initialKey] = data.requestId;
      }

      if (data.chatId) {
        const nextChatId: string = data.chatId;
        resolvedChatId = nextChatId;
        activeResolvedChatIdsRef.current[nextChatId] = nextChatId;

        // CRITICAL: We must set streaming and loading states for nextChatId BEFORE transitioning the active chat ID.
        // This prevents useChatMessages hook from triggering a DB load and showing stuck skeletons/dots.
        setIsStreaming(true, nextChatId);
        setLoading(true, nextChatId);

        if (isCreatingChat) {
          const chatPayload = {
            _id: nextChatId,
            title: optimisticTitle || "New Chat",
            isArchived: false,
            isPinned: false,
            updatedAt: new Date().toISOString(),
          };
          pendingChatPayload = chatPayload;

          const shouldSelectResolvedChat =
            useChatStore.getState().currentChatId === initialChatId;
          if (shouldSelectResolvedChat) {
            setCurrentChat(nextChatId);
            const activeProjectId = useProjectStore.getState().activeProjectId;
            if (activeProjectId) {
              navigate(`/projects/${activeProjectId}/chat/${nextChatId}`, { replace: true });
            } else {
              navigate(`/chat/${nextChatId}`, { replace: true });
            }
          }
          setIsNewChat(false);
        }
        // If the server resolves a new chat id during a "new chat" stream, move optimistic messages over.
        if (initialKey === NEW_CHAT_STREAM_KEY) {
          setOptimisticMessagesByChatId((current) => {
            const pending = current[NEW_CHAT_STREAM_KEY];
            if (!pending) return current;
            return {
              ...current,
              [nextChatId]: pending,
              [NEW_CHAT_STREAM_KEY]: null,
            };
          });

          if (pendingOptimisticUpdateRef.current[NEW_CHAT_STREAM_KEY]) {
            pendingOptimisticUpdateRef.current[nextChatId] =
              pendingOptimisticUpdateRef.current[NEW_CHAT_STREAM_KEY];
            delete pendingOptimisticUpdateRef.current[NEW_CHAT_STREAM_KEY];
          }

          // Migrate references
          if (activeAbortControllersRef.current[NEW_CHAT_STREAM_KEY]) {
            activeAbortControllersRef.current[nextChatId] =
              activeAbortControllersRef.current[NEW_CHAT_STREAM_KEY];
            delete activeAbortControllersRef.current[NEW_CHAT_STREAM_KEY];
          }
          if (connectionTimeoutsRef.current[NEW_CHAT_STREAM_KEY]) {
            connectionTimeoutsRef.current[nextChatId] =
              connectionTimeoutsRef.current[NEW_CHAT_STREAM_KEY];
            delete connectionTimeoutsRef.current[NEW_CHAT_STREAM_KEY];
          }
          if (activeRequestIdsRef.current[NEW_CHAT_STREAM_KEY]) {
            activeRequestIdsRef.current[nextChatId] =
              activeRequestIdsRef.current[NEW_CHAT_STREAM_KEY];
            delete activeRequestIdsRef.current[NEW_CHAT_STREAM_KEY];
          }
          if (activeResolvedChatIdsRef.current[NEW_CHAT_STREAM_KEY]) {
            activeResolvedChatIdsRef.current[nextChatId] =
              activeResolvedChatIdsRef.current[NEW_CHAT_STREAM_KEY];
            delete activeResolvedChatIdsRef.current[NEW_CHAT_STREAM_KEY];
          }
          if (stopRequestedRef.current[NEW_CHAT_STREAM_KEY] !== undefined) {
            stopRequestedRef.current[nextChatId] =
              stopRequestedRef.current[NEW_CHAT_STREAM_KEY];
            delete stopRequestedRef.current[NEW_CHAT_STREAM_KEY];
          }

          // Clear Zustand temporary key values to prevent leaking stream state to subsequent new chats
          setIsStreaming(false, NEW_CHAT_STREAM_KEY);
          setLoading(false, NEW_CHAT_STREAM_KEY);
        }
      }

      if (data.messageId) {
        const key = resolvedChatId ?? initialKey;
        const currentPlaceholderId = placeholderMessageId;
        const realId = data.messageId;

        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;

          const assistantIndex = messagesForChat.findLastIndex(
            (m) => m.id === currentPlaceholderId || m.id === realId,
          );

          if (assistantIndex === -1) return current;

          const next = [...messagesForChat];
          next[assistantIndex] = {
            ...next[assistantIndex],
            id: realId,
          };

          // Update the local variable so subsequent chunks use the real ID
          placeholderMessageId = realId;

          return { ...current, [key]: next };
        });

        // Also sync pending updates map
        if (
          pendingOptimisticUpdateRef.current[key]?.messageId ===
          currentPlaceholderId
        ) {
          pendingOptimisticUpdateRef.current[key].messageId = realId;
        }
      }

      if (data.model) {
        const key = resolvedChatId ?? initialKey;
        queueOptimisticMessageUpdate(key, placeholderMessageId, {
          model: data.model,
          requestId: activeRequestId,
        });
      }

      if (data.status && !data.chunk && !data.done) {
        const key = resolvedChatId ?? initialKey;
        queueOptimisticMessageUpdate(key, placeholderMessageId, {
          status: data.status,
          requestId: activeRequestId,
        });
      }

      if (data.chunk) {
        fullContent += data.chunk;
        const key = resolvedChatId ?? initialKey;

        if (pendingChatPayload && !hasUpsertedSidebar) {
          hasUpsertedSidebar = true;
          const activeProjectId = useProjectStore.getState().activeProjectId;
          if (activeProjectId) {
            useProjectStore.getState().addChatToProjectStore(pendingChatPayload);
          } else {
            upsertChat(pendingChatPayload);
          }
        }

        queueOptimisticMessageUpdate(key, placeholderMessageId, {
          content: fullContent,
          requestId: activeRequestId,
          status: data.status ?? "streaming",
          isWebSearching: false,
          isParsingDocument: false,
        });
      }

      if (data.error) {
        const errorMessage = data.error;
        const key = resolvedChatId ?? initialKey;
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: errorMessage,
            status: "failed",
            isWebSearching: false,
            isParsingDocument: false,
            requestId: activeRequestId,
          };
          return { ...current, [key]: next };
        });
      }

      if ("sources" in data && data.sources && Array.isArray(data.sources)) {
        const sources = data.sources as WebSource[];
        const key = resolvedChatId ?? initialKey;

        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;

          // Find the last assistant message (the streaming one)
          const lastAssistantIdx = messagesForChat.findLastIndex(
            (m) => m.role === "assistant" && m.status === "streaming"
          );
          if (lastAssistantIdx === -1) return current;

          const next = [...messagesForChat];
          next[lastAssistantIdx] = {
            ...next[lastAssistantIdx],
            sources,
            isWebSearching: false, // sources are ready, stop spinning globe
            isParsingDocument: false,
          };
          return { ...current, [key]: next };
        });

        // Also mark the placeholder as having sources (if needed)
        // Optionally flush any pending updates
        if (pendingOptimisticUpdateRef.current[key]) {
          // force a flush to show sources immediately
          flushOptimisticUpdates();
        }
        return; // no further processing for this event
      }

      if (data.done) {
        if (pendingChatPayload && !hasUpsertedSidebar) {
          hasUpsertedSidebar = true;
          const activeProjectId = useProjectStore.getState().activeProjectId;
          if (activeProjectId) {
            useProjectStore.getState().addChatToProjectStore(pendingChatPayload);
          } else {
            upsertChat(pendingChatPayload);
          }
        }
        if (pendingOptimisticFrameRef.current !== null) {
          flushOptimisticUpdates();
        }

        const key = resolvedChatId ?? initialKey;
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: fullContent || next[next.length - 1].content,
            requestId: activeRequestId,
            status: data.status ?? "completed",
            isWebSearching: false,
            isParsingDocument: false,
          };

          if (resolvedChatId) {
            const finalChatId = resolvedChatId;
            queueMicrotask(async () => {
              // Commit the optimistic ones first
              commitMessagesForChat(finalChatId, next);

              // Then fetch real IDs from server
              if (user?.id) {
                try {
                  const realMessages =
                    await chatService.fetchMessages(finalChatId, true);
                  setMessages(realMessages);
                  setOptimisticMessagesForChat(finalChatId, null);
                } catch (err) {
                  console.error("Error refreshing messages after stream", err);
                }
              }
            });
          }
          return { ...current, [key]: next };
        });
        activeAbortControllersRef.current[key] = null;
        activeRequestIdsRef.current[key] = null;
        activeResolvedChatIdsRef.current[key] = null;
        setIsStreaming(false, key);
        setLoading(false, key);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          await processEvent(event);
        }

        if (done) {
          if (buffer.trim()) await processEvent(buffer);
          break;
        }
      }
    } finally {
      const activeKey = resolvedChatId ?? initialKey;
      setIsStreaming(false, activeKey);
      setLoading(false, activeKey);
      const chatIdToRefresh = resolvedChatId ?? initialChatId;
      const wasStopped = stopRequestedRef.current[activeKey] === true;
      activeAbortControllersRef.current[activeKey] = null;
      activeRequestIdsRef.current[activeKey] = null;
      activeResolvedChatIdsRef.current[activeKey] = null;

      // Ensure we have the latest messages with real IDs after ANY stream ends
      if (chatIdToRefresh && user?.id && !wasStopped) {
        refreshChats().catch((err) =>
          console.error("Error refreshing chats list  ", err),
        );

        chatService
          .fetchMessages(chatIdToRefresh, true)
          .then((realMessages) => {
            setMessages(realMessages);
            setOptimisticMessagesForChat(chatIdToRefresh, null);
          })
          .catch((err) =>
            console.error(
              "Error refreshing messages in processStream finally",
              err,
            ),
          );
      }
    }
  };
  const resumeStream = async (chatId: string) => {
    const chatKey = getActiveChatKey(chatId);
    stopRequestedRef.current[chatKey] = false;
    try {
      // First fetch the latest messages from the server to ensure UI is up-to-date
      // even if the stream has already completed on the server.
      const baseMessages = await loadMessagesForResume(chatId);

      const lastMessage = baseMessages[baseMessages.length - 1];
      if (
        !lastMessage ||
        lastMessage.role !== "assistant" ||
        lastMessage.status !== "streaming"
      ) {
        return false;
      }

      const url = chatService.getStreamUpdatesUrl(chatId);
      const abortController = new AbortController();
      activeAbortControllersRef.current[chatKey] = abortController;
      activeResolvedChatIdsRef.current[chatKey] = chatId;

      // Client-side safety timeout for connection
      connectionTimeoutsRef.current[chatKey] = setTimeout(() => {
        if (activeAbortControllersRef.current[chatKey] === abortController) {
          abortController.abort();
        }
      }, 35000);

      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        },
        signal: abortController.signal,
      });

      if (connectionTimeoutsRef.current[chatKey]) {
        clearTimeout(connectionTimeoutsRef.current[chatKey]!);
        connectionTimeoutsRef.current[chatKey] = null;
      }

      if (!response.ok) return false;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("text/event-stream")) {
        // If stream is no longer active but we found a "streaming" message in the DB,
        // it means the stream completed/failed while we were disconnected.
        // We should fix the status of the stuck message.
        const lastMessage = baseMessages[baseMessages.length - 1];
        if (
          lastMessage?.role === "assistant" &&
          lastMessage.status === "streaming"
        ) {
          const nextMessages = [...baseMessages];
          nextMessages[nextMessages.length - 1] = {
            ...lastMessage,
            status: "completed", // Fallback to completed since it's no longer streaming
          };
          commitMessagesForChat(chatId, nextMessages);
        }
        return false;
      }

      // Add a placeholder message for the incoming stream
      const assistantPlaceholder: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        model: "gemini", // Will be updated by stream
        status: "streaming",
      };

      setLoading(true, chatId);
      setIsStreaming(true, chatId);

      const { nextMessages, targetMessageId } = buildResumeMessages(
        baseMessages,
        assistantPlaceholder,
      );

      setOptimisticMessagesForChat(chatId, nextMessages);

      await processStream(
        response,
        false,
        chatId,
        crypto.randomUUID(),
        targetMessageId,
      );
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return false;
      }

      console.error("Error resuming stream", err);
      setLoading(false, chatId);
      setIsStreaming(false, chatId);
      setOptimisticMessagesForChat(chatId, null);
      activeAbortControllersRef.current[chatKey] = null;
      activeRequestIdsRef.current[chatKey] = null;
      activeResolvedChatIdsRef.current[chatKey] = null;

      if (connectionTimeoutsRef.current[chatKey]) {
        clearTimeout(connectionTimeoutsRef.current[chatKey]!);
        connectionTimeoutsRef.current[chatKey] = null;
      }

      return false;
    }
  };

  useEffect(() => {
    resumeStreamRef.current = resumeStream;
  });

  // Attempt to resume stream when chat changes or component mounts
  useEffect(() => {
    if (!currentChatId) {
      resumeAttemptedChatIdRef.current = null;
      return;
    }

    if (resumeAttemptedChatIdRef.current === currentChatId) return;
    resumeAttemptedChatIdRef.current = currentChatId;

    if (streamingChatIds[getActiveChatKey(currentChatId)]) return;

    // Small timeout to ensure messages are loaded first before attempting recovery.
    const timer = setTimeout(() => {
      resumeStreamRef.current(currentChatId);
    }, 500);
    return () => clearTimeout(timer);
  }, [currentChatId, streamingChatIds]);

  const streamMessage = async (
    input: string,
    provider: string,
    attachments: NonNullable<Message["attachments"]> = [],
    options?: {
      forceNewChat?: boolean;
      webSearchEnabled?: boolean;
      selection?: {
        selectedText: string;
        originalSourceMessage: string;
        sourceMessageId: string;
        actionType: string;
      };
      attachedFile?: File;
    },
  ) => {
    if (!input.trim() && attachments.length === 0 && !options?.selection)
      return;
    if (!user?.id) return;

    const forceNewChat = options?.forceNewChat === true;
    const webSearchEnabled = options?.webSearchEnabled === true;
    const storeState = useChatStore.getState();
    const effectiveCurrentChatId = forceNewChat
      ? null
      : storeState.currentChatId;

    // Build final attachments: include document file as a virtual attachment
    let finalAttachments = attachments;
    if (options?.attachedFile) {
      finalAttachments = [
        ...attachments,
        {
          name: options.attachedFile.name,
          mimeType: options.attachedFile.type,
          size: options.attachedFile.size,
          url: '',
          isDocument: true,   // custom flag for the UI
        },
      ];
    }

    const activeKey = getActiveChatKey(effectiveCurrentChatId);
    if (loadingChatIds[activeKey]) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim() || (options?.selection ? "Explain this" : ""),
      model: provider,
      status: "completed",
      attachments: finalAttachments,
      metadata: options?.selection
        ? { selection: options.selection }
        : undefined,
    };
    const requestId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: requestId, // Use the same ID as requestId for easy lookup
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
      isParsingDocument: !!options?.attachedFile,
    };
    const isCreatingChat = !effectiveCurrentChatId;
    const baseMessages = forceNewChat
      ? []
      : (optimisticMessagesByChatId[activeKey] ?? storeState.messages);
    const optimisticTitle = createOptimisticTitle(input);
    const abortController = new AbortController();

    if (forceNewChat) {
      setCurrentChat(null);
      setMessages([]);
      setIsNewChat(true);
      navigate("/chat");
    }

    activeAbortControllersRef.current[activeKey] = abortController;
    activeRequestIdsRef.current[activeKey] = requestId;
    activeResolvedChatIdsRef.current[activeKey] = effectiveCurrentChatId;

    // Set optimistic UI
    setOptimisticMessagesForChat(activeKey, [
      ...baseMessages,
      userMessage,
      assistantPlaceholder,
    ]);

    // Optimistically move the chat to the top of the sidebar when activity starts.
    const activeChat =
      storeState.currentChat ??
      storeState.chats.find((chat) => chat._id === effectiveCurrentChatId);

    if (effectiveCurrentChatId && activeChat) {
      const updatedChat = {
        ...activeChat,
        updatedAt: new Date().toISOString(),
      };
      const activeProjectId = useProjectStore.getState().activeProjectId;
      if (activeProjectId) {
        // Project chats only update in the project store
        useProjectStore.getState().addChatToProjectStore(updatedChat);
      } else {
        upsertChat(updatedChat);
      }
    }
    setLoading(true, activeKey);
    setIsStreaming(true, activeKey);
    stopRequestedRef.current[activeKey] = false;

    try {
      const url = chatService.getStreamUrl(effectiveCurrentChatId || undefined);

      // Client-side safety timeout for connection
      connectionTimeoutsRef.current[activeKey] = setTimeout(() => {
        if (activeAbortControllersRef.current[activeKey] === abortController) {
          abortController.abort();
        }
      }, 35000); // 35s to allow server-side 30s timeout to trigger first

      const hasDocument = !!options?.attachedFile;

      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        Authorization: `Bearer ${await getToken()}`,
      };

      let body: FormData | string;

      if (hasDocument) {
        const fd = new FormData();
        fd.append("message", input);
        fd.append("provider", provider);
        fd.append("requestId", requestId);
        fd.append("attachments", JSON.stringify(attachments));
        fd.append("webSearchEnabled", String(webSearchEnabled));
        if (options?.selection) {
          fd.append("selection", JSON.stringify(options.selection));
        }
        fd.append("file", options.attachedFile!);
        body = fd;
        // Let the browser set multipart Content-Type with boundary
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          message: input,
          provider,
          requestId,
          attachments,
          webSearchEnabled,
          selection: options?.selection,
          projectId: useProjectStore.getState().activeProjectId || undefined,
        });
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: abortController.signal,
        body,
      });

      if (connectionTimeoutsRef.current[activeKey]) {
        clearTimeout(connectionTimeoutsRef.current[activeKey]!);
        connectionTimeoutsRef.current[activeKey] = null;
      }

      if (!response.ok) {
        if (
          stopRequestedRef.current[activeKey] &&
          activeRequestIdsRef.current[activeKey] === requestId
        ) {
          const resolvedChatId =
            activeResolvedChatIdsRef.current[activeKey] ?? effectiveCurrentChatId;
          const key = getActiveChatKey(resolvedChatId);

          setOptimisticMessagesByChatId((current) => {
            const messagesForChat = current[key];
            if (!messagesForChat?.length) return current;
            const next = [...messagesForChat];
            next[next.length - 1] = {
              ...next[next.length - 1],
              status: stopRequestedRef.current[key] ? "stopped" : "failed",
            };
            queueMicrotask(() => {
              commitMessagesForChat(resolvedChatId, next);
            });
            return { ...current, [key]: next };
          });

          setLoading(false, resolvedChatId);
          setIsStreaming(false, resolvedChatId);
          return;
        }

        throw new Error("Failed to connect to stream");
      }

      await processStream(
        response,
        isCreatingChat,
        effectiveCurrentChatId,
        requestId,
        assistantPlaceholder.id!,
        optimisticTitle,
      );

      if (webSearchEnabled && hookOptions?.onWebSearchComplete) {
        hookOptions.onWebSearchComplete();
      }
    } catch (err) {
      const resolvedChatId =
        activeResolvedChatIdsRef.current[activeKey] ?? effectiveCurrentChatId;
      const key = getActiveChatKey(resolvedChatId);
      const isCleanStop =
        !!stopRequestedRef.current[key] ||
        !!stopRequestedRef.current[activeKey] ||
        !!stopRequestedRef.current[NEW_CHAT_STREAM_KEY];

      if (err instanceof DOMException && err.name === "AbortError") {
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: isCleanStop ? "stopped" : "failed",
          };
          queueMicrotask(() => {
            commitMessagesForChat(resolvedChatId, next);
          });
          return { ...current, [key]: next };
        });

        setLoading(false, key);
        setIsStreaming(false, key);
        return;
      }

      if (isCleanStop) {
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: "stopped",
          };
          queueMicrotask(() => {
            commitMessagesForChat(resolvedChatId, next);
          });
          return { ...current, [key]: next };
        });

        setLoading(false, key);
        setIsStreaming(false, key);
        return;
      }

      console.error("Error streaming message", err);
      const errorMessage = chatService.getChatErrorMessage(err);

      setOptimisticMessagesByChatId((current) => {
        const messagesForChat = current[key];
        if (!messagesForChat?.length) return current;
        const next = [...messagesForChat];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: errorMessage,
          status: "failed",
        };
        queueMicrotask(() => {
          commitMessagesForChat(resolvedChatId, next);
        });
        return { ...current, [key]: next };
      });
    } finally {
      if (activeRequestIdsRef.current[activeKey] === requestId) {
        const resolvedChatId =
          activeResolvedChatIdsRef.current[activeKey] ?? effectiveCurrentChatId;
        const key = getActiveChatKey(resolvedChatId);
        activeAbortControllersRef.current[activeKey] = null;
        activeRequestIdsRef.current[activeKey] = null;
        activeResolvedChatIdsRef.current[activeKey] = null;
        stopRequestedRef.current[activeKey] = false;

        if (connectionTimeoutsRef.current[activeKey]) {
          clearTimeout(connectionTimeoutsRef.current[activeKey]!);
          connectionTimeoutsRef.current[activeKey] = null;
        }

        setLoading(false, key);
        setIsStreaming(false, key);
      }
    }
  };

  const stopGeneration = async (targetChatId?: string | null | any) => {
    const resolvedChatIdParam = typeof targetChatId === "string" ? targetChatId : null;
    const chatKey = getActiveChatKey(resolvedChatIdParam ?? currentChatId);
    const requestId = activeRequestIdsRef.current[chatKey];
    const chatId = activeResolvedChatIdsRef.current[chatKey] ?? (resolvedChatIdParam ?? currentChatId);

    if (!requestId) return;

    stopRequestedRef.current[chatKey] = true;
    markAssistantMessageStatus(chatId, requestId, "stopped");
    activeAbortControllersRef.current[chatKey]?.abort();

    try {
      const res = await chatService.stopStream(requestId, chatId);
      const isDeleted = res?.data?.deleted === true;

      if (isDeleted) {
        if (chatId) {
          removeChat(chatId);
        }
        setOptimisticMessagesForChat(NEW_CHAT_STREAM_KEY, null);
        if (chatId) {
          setOptimisticMessagesForChat(chatId, null);
        }
        useChatStore.getState().setCurrentChat(null);
        useChatStore.getState().setMessages([]);
        useChatStore.getState().setIsNewChat(true);
        navigate("/chat", { replace: true });
        return;
      }

      if (user?.id) {
        await refreshChats();
        if (chatId) {
          const realMessages = await chatService.fetchMessages(chatId, true);
          setMessages(realMessages);
          setOptimisticMessagesForChat(chatId, null);
        }
      }
    } catch (err) {
      console.error("Error stopping stream", err);
      toast.error("Could not stop generation cleanly on the server.");
    } finally {
      if (connectionTimeoutsRef.current[chatKey]) {
        clearTimeout(connectionTimeoutsRef.current[chatKey]!);
        connectionTimeoutsRef.current[chatKey] = null;
      }
      activeAbortControllersRef.current[chatKey] = null;
      activeRequestIdsRef.current[chatKey] = null;
      activeResolvedChatIdsRef.current[chatKey] = null;
      stopRequestedRef.current[chatKey] = false;
      setIsStreaming(false, chatKey);
      setLoading(false, chatKey);
    }
  };

  const editMessage = async (
    messageId: string,
    newContent: string,
    provider: string,
    options?: {
      webSearchEnabled?: boolean;
      attachments?: Attachment[];
      attachedFile?: File | null;
      selection?: any;
    },
  ) => {
    if (!newContent.trim()) return;
    if (!user?.id || !currentChatId) return;

    const activeKey = getActiveChatKey(currentChatId);

    // If streaming is active, stop it first before editing
    if (activeRequestIdsRef.current[activeKey]) {
      await stopGeneration(currentChatId);
    }

    const webSearchEnabled = options?.webSearchEnabled === true;
    const storeState = useChatStore.getState();
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    activeAbortControllersRef.current[activeKey] = abortController;
    activeRequestIdsRef.current[activeKey] = requestId;
    activeResolvedChatIdsRef.current[activeKey] = currentChatId;

    // Set optimistic UI — immutable: mark old user message + everything after it as inactive,
    // then append the new user message and a streaming assistant placeholder.
    const currentMessages =
      optimisticMessagesByChatId[activeKey] ??
      storeState.messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);

    if (messageIndex === -1) return;

    const origMsg = currentMessages[messageIndex];
    // Temporary branchId to group original user msg and the new edit
    const userBranchId = origMsg.branchId ?? `edit-${messageId}`;

    // New user message node (edit branch)
    const editedUserMessage: Message = {
      ...origMsg,
      id: `opt-user-${requestId}`,   // temporary optimistic id
      content: newContent,
      attachments: options?.attachments,
      status: "completed",
      metadata: {
        ...origMsg.metadata,
        ...(options && "selection" in options ? { selection: options.selection } : {}),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Branch fields
      parentId: origMsg.parentId ?? null,
      editedFrom: messageId,
      branchId: userBranchId,
      version: (origMsg.version ?? 1) + 1,
      isActive: true,
    };

    const assistantPlaceholder: Message = {
      id: requestId,
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
      parentId: `opt-user-${requestId}`, // Connect to the optimistic user message!
      isActive: true,
    };

    // Mark only the edited user message itself as inactive (and assign branchId if not set)
    const nextMessages: Message[] = [
      ...currentMessages.map((m) =>
        m.id === messageId
          ? { ...m, isActive: false, branchId: m.branchId ?? userBranchId }
          : m
      ),
      editedUserMessage,
      assistantPlaceholder,
    ];

    setOptimisticMessagesForChat(currentChatId, nextMessages);
    setLoading(true, currentChatId);
    setIsStreaming(true, currentChatId);
    stopRequestedRef.current[activeKey] = false;

    try {
      const url = chatService.getEditStreamUrl(currentChatId, messageId);

      connectionTimeoutsRef.current[activeKey] = setTimeout(() => {
        if (activeAbortControllersRef.current[activeKey] === abortController) {
          abortController.abort();
        }
      }, 35000);

      let body: any;
      const headers: any = {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        Authorization: `Bearer ${await getToken()}`,
      };

      if (options?.attachedFile) {
        body = new FormData();
        body.append("content", newContent);
        body.append("provider", provider);
        body.append("requestId", requestId);
        if (webSearchEnabled) {
          body.append("webSearchEnabled", "true");
        }
        if (options?.attachments) {
          body.append("attachments", JSON.stringify(options.attachments));
        }
        if (options?.selection !== undefined) {
          body.append("selection", typeof options.selection === 'string' ? options.selection : JSON.stringify(options.selection));
        }
        body.append("file", options.attachedFile);
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          content: newContent,
          provider,
          requestId,
          webSearchEnabled,
          attachments: options?.attachments,
          selection: options?.selection,
        });
      }

      const response = await fetch(url, {
        method: "PATCH",
        headers,
        signal: abortController.signal,
        body,
      });

      if (connectionTimeoutsRef.current[activeKey]) {
        clearTimeout(connectionTimeoutsRef.current[activeKey]!);
        connectionTimeoutsRef.current[activeKey] = null;
      }

      if (!response.ok) {
        throw new Error("Failed to connect to stream");
      }

      await processStream(
        response,
        false,
        currentChatId,
        requestId,
        assistantPlaceholder.id!,
      );

      if (webSearchEnabled && hookOptions?.onWebSearchComplete) {
        hookOptions.onWebSearchComplete();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const resolvedChatId = activeResolvedChatIdsRef.current[activeKey] ?? currentChatId;
        const key = getActiveChatKey(resolvedChatId);

        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: stopRequestedRef.current[key] ? "stopped" : "failed",
          };
          queueMicrotask(() => {
            commitMessagesForChat(resolvedChatId, next);
          });
          return { ...current, [key]: next };
        });
        return;
      }
      console.error("Error editing message", err);
    } finally {
      if (activeRequestIdsRef.current[activeKey] === requestId) {
        activeAbortControllersRef.current[activeKey] = null;
        activeRequestIdsRef.current[activeKey] = null;
        activeResolvedChatIdsRef.current[activeKey] = null;
        setLoading(false, currentChatId);
        setIsStreaming(false, currentChatId);
      }
    }
  };

  const retryMessage = async (messageId: string, provider: string, webSearchEnabled?: boolean) => {
    if (!user?.id || !currentChatId) return;

    const activeKey = getActiveChatKey(currentChatId);

    // If streaming is active, stop it first before retrying
    if (activeRequestIdsRef.current[activeKey]) {
      await stopGeneration(currentChatId);
    }

    const storeState = useChatStore.getState();
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    activeAbortControllersRef.current[activeKey] = abortController;
    activeRequestIdsRef.current[activeKey] = requestId;
    activeResolvedChatIdsRef.current[activeKey] = currentChatId;

    // Set optimistic UI — immutable: mark old assistant inactive, append new streaming node
    const currentMessages =
      optimisticMessagesByChatId[activeKey] ??
      storeState.messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);

    if (messageIndex === -1) return;

    const oldMsg = currentMessages[messageIndex];

    // Assign a temporary branchId shared by old + new so resolveActiveBranch groups them
    const tempBranchId = oldMsg.branchId ?? `branch-${messageId}`;

    // Add a temporary streaming/loading assistant message
    const assistantPlaceholder: Message = {
      id: requestId,
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
      // Branch metadata so resolveActiveBranch picks this one as active
      parentId: oldMsg.parentId ?? null,
      branchId: tempBranchId,
      version: (oldMsg.version ?? 1) + 1,
      isActive: true,
    };

    // Mark old assistant as inactive, keep it in array (immutable)
    const nextMessages: Message[] = [
      ...currentMessages.map((m) =>
        m.id === messageId
          ? { ...m, branchId: tempBranchId, version: m.version ?? 1, isActive: false }
          : m,
      ),
      assistantPlaceholder,
    ];

    setOptimisticMessagesForChat(currentChatId, nextMessages);
    setLoading(true, currentChatId);
    setIsStreaming(true, currentChatId);
    stopRequestedRef.current[activeKey] = false;

    try {
      const url = chatService.getRetryStreamUrl(currentChatId, messageId);

      connectionTimeoutsRef.current[activeKey] = setTimeout(() => {
        if (activeAbortControllersRef.current[activeKey] === abortController) {
          abortController.abort();
        }
      }, 35000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          provider,
          requestId,
          webSearchEnabled,
        }),
      });

      if (connectionTimeoutsRef.current[activeKey]) {
        clearTimeout(connectionTimeoutsRef.current[activeKey]!);
        connectionTimeoutsRef.current[activeKey] = null;
      }

      if (!response.ok) {
        throw new Error("Failed to connect to stream");
      }

      await processStream(
        response,
        false,
        currentChatId,
        requestId,
        assistantPlaceholder.id!,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const resolvedChatId = activeResolvedChatIdsRef.current[activeKey] ?? currentChatId;
        const key = getActiveChatKey(resolvedChatId);

        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: stopRequestedRef.current[key] ? "stopped" : "failed",
          };
          queueMicrotask(() => {
            commitMessagesForChat(resolvedChatId, next);
          });
          return { ...current, [key]: next };
        });
        return;
      }
      console.error("Error retrying message", err);
    } finally {
      if (activeRequestIdsRef.current[activeKey] === requestId) {
        activeAbortControllersRef.current[activeKey] = null;
        activeRequestIdsRef.current[activeKey] = null;
        activeResolvedChatIdsRef.current[activeKey] = null;
        setLoading(false, currentChatId);
        setIsStreaming(false, currentChatId);
      }
    }
  };

  return {
    streamMessage,
    editMessage,
    retryMessage,
    stopGeneration,
    optimisticMessages:
      optimisticMessagesByChatId[getActiveChatKey(currentChatId)] ?? null,
    isStreaming: isStreamingCurrentChat,
    loading: isLoadingCurrentChat,
  };
};
