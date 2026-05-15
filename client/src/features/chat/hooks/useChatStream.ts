import { useEffect, useRef, useState } from "react";
import { useUser, useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/features/chat/store/useChatStore";
import {
    chatService,
    type Message,
} from "@/features/chat/services/chat.service";
import { CHAT_TITLE_MAX_LENGTH } from "@/features/chat/constants/chat.constants";
import { toast } from "sonner";
 
const NEW_CHAT_STREAM_KEY = "__new_chat_stream__";
 
const getActiveChatKey = (chatId: string | null) =>
  chatId ?? NEW_CHAT_STREAM_KEY;
 
const createOptimisticTitle = (input: string) =>
  input.trim().slice(0, CHAT_TITLE_MAX_LENGTH) || "New Chat";
 
export const useChatStream = (hookOptions?: {
  onWebSearchComplete?: () => void;
}) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const currentChatId = useChatStore((state) => state.currentChatId);
  const loading = useChatStore((state) => state.loading);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingChatId = useChatStore((state) => state.streamingChatId);
  const setCurrentChat = useChatStore((state) => state.setCurrentChat);
  const setChats = useChatStore((state) => state.setChats);
  const setIsNewChat = useChatStore((state) => state.setIsNewChat);
  const upsertChat = useChatStore((state) => state.upsertChat);
  const setMessages = useChatStore((state) => state.setMessages);
  const setLoading = useChatStore((state) => state.setLoading);
  const setIsStreaming = useChatStore((state) => state.setIsStreaming);
 
  const [optimisticMessagesByChatId, setOptimisticMessagesByChatId] = useState<
    Record<string, Message[] | null>
  >({});
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activeRequestIdRef = useRef<string | null>(null);
  const activeResolvedChatIdRef = useRef<string | null>(null);
  const resumeAttemptedChatIdRef = useRef<string | null>(null);
  const previousChatIdRef = useRef<string | null>(currentChatId);
  const resumeStreamRef = useRef<(chatId: string) => Promise<boolean>>(
    async () => false,
  );
  const stopRequestedRef = useRef(false);
 
  const pendingOptimisticUpdateRef = useRef<
    Record<string, { messageId: string; partialMessage: Partial<Message> }>
  >({});
  const pendingOptimisticFrameRef = useRef<number | null>(null);
 
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
 
  const setOptimisticMessagesForChat = (
    chatId: string | null,
    next: Message[] | null,
  ) => {
    const key = getActiveChatKey(chatId);
    setOptimisticMessagesByChatId((current) => ({
      ...current,
      [key]: next,
    }));
  };
 
  const isStreamingCurrentChat =
    isStreaming &&
    streamingChatId === getActiveChatKey(currentChatId) &&
    !!streamingChatId;
  const isLoadingCurrentChat =
    loading &&
    streamingChatId === getActiveChatKey(currentChatId) &&
    !!streamingChatId;
 
  // Clear stale optimistic messages only when the selected chat actually changes.
  useEffect(() => {
    if (previousChatIdRef.current === currentChatId) return;
 
    const chatIdToClear = currentChatId;
    previousChatIdRef.current = currentChatId;
 
    if (!chatIdToClear) return;
 
    queueMicrotask(() => {
      const { isStreaming, streamingChatId } = useChatStore.getState();
      if (isStreaming && streamingChatId === chatIdToClear) return;
      setOptimisticMessagesForChat(chatIdToClear, null);
    });
  }, [currentChatId, setOptimisticMessagesForChat]);
 
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
 
    if (!reader) throw new Error("Stream reader unavailable");
 
    const processEvent = async (rawEvent: string) => {
      const data = chatService.parseStreamEvent(rawEvent);
      if (!data) return;
 
      if (data.requestId) {
        activeRequestId = data.requestId;
        activeRequestIdRef.current = data.requestId;
      }
 
      if (data.chatId) {
        const nextChatId: string = data.chatId;
        resolvedChatId = nextChatId;
        activeResolvedChatIdRef.current = nextChatId;
        if (isCreatingChat) {
          upsertChat({
            _id: nextChatId,
            title: optimisticTitle || "New Chat",
          });
          const shouldSelectResolvedChat =
            useChatStore.getState().currentChatId === initialChatId;
          if (shouldSelectResolvedChat) {
            setCurrentChat(nextChatId);
            navigate(`/chat/${nextChatId}`, { replace: true });
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
        }
        setIsStreaming(true, nextChatId);
      }
 
      if (data.model) {
        const key = resolvedChatId ?? initialKey;
        queueOptimisticMessageUpdate(key, placeholderMessageId, {
          model: data.model,
          requestId: activeRequestId,
        });
      }
 
      if (data.chunk) {
        fullContent += data.chunk;
        const key = resolvedChatId ?? initialKey;
        queueOptimisticMessageUpdate(key, placeholderMessageId, {
          content: fullContent,
          requestId: activeRequestId,
          status: data.status ?? "streaming",
          isWebSearching: false,
        });
      }
 
      if (data.error) {
        const errorMessage = data.error;
        toast.error(errorMessage);
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
            requestId: activeRequestId,
          };
          return { ...current, [key]: next };
        });
      }
 
      if (data.done) {
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
          };

          if (resolvedChatId) {
            const finalChatId = resolvedChatId;
            queueMicrotask(async () => {
              // Commit the optimistic ones first
              commitMessagesForChat(finalChatId, next);

              // Then fetch real IDs from server
              if (user?.id) {
                try {
                  const realMessages = await chatService.fetchMessages(finalChatId);
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
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        activeResolvedChatIdRef.current = null;
        setIsStreaming(false);
        setLoading(false);
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
      setIsStreaming(false);
      setLoading(false);
      const chatIdToRefresh = activeResolvedChatIdRef.current ?? initialChatId;
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeResolvedChatIdRef.current = null;

      // Ensure we have the latest messages with real IDs after ANY stream ends
      if (chatIdToRefresh && user?.id) {
        refreshChats().catch(err => console.error("Error refreshing chats list", err));
        chatService.fetchMessages(chatIdToRefresh)
          .then(realMessages => {
            setMessages(realMessages);
            setOptimisticMessagesForChat(chatIdToRefresh, null);
          })
          .catch(err => console.error("Error refreshing messages in processStream finally", err));
      }
    }
  };
 
  const resumeStream = async (chatId: string) => {
    stopRequestedRef.current = false;
    try {
      // First fetch the latest messages from the server to ensure UI is up-to-date
      // even if the stream has already completed on the server.
      const baseMessages = await loadMessagesForResume(chatId);
 
      const url = chatService.getStreamUpdatesUrl(chatId);
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;
      activeResolvedChatIdRef.current = chatId;
 
      // Client-side safety timeout for connection
      connectionTimeoutRef.current = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          abortController.abort();
          toast.error("Connection timed out. Please try again.");
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
 
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
 
      if (!response.ok) return false;
 
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("text/event-stream")) {
        // If stream is no longer active but we found a "streaming" message in the DB,
        // it means the stream completed/failed while we were disconnected.
        // We should fix the status of the stuck message.
        const lastMessage = baseMessages[baseMessages.length - 1];
        if (lastMessage?.role === "assistant" && lastMessage.status === "streaming") {
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
 
      setLoading(true);
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
      setLoading(false);
      setIsStreaming(false);
      setOptimisticMessagesForChat(chatId, null);
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeResolvedChatIdRef.current = null;
 
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
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
 
    if (isStreaming && streamingChatId === currentChatId) return;
 
    // Small timeout to ensure messages are loaded first before attempting recovery.
    const timer = setTimeout(() => {
      resumeStreamRef.current(currentChatId);
    }, 500);
    return () => clearTimeout(timer);
  }, [currentChatId, isStreaming, streamingChatId]);
 
  const streamMessage = async (
    input: string,
    provider: string,
    attachments: NonNullable<Message["attachments"]> = [],
    options?: {
      forceNewChat?: boolean;
      webSearchEnabled?: boolean;
    },
  ) => {
    if (!input.trim() && attachments.length === 0) return;
    if (loading || !user?.id) return;

    const forceNewChat = options?.forceNewChat === true;
    const webSearchEnabled = options?.webSearchEnabled === true;
    const storeState = useChatStore.getState();
    const effectiveCurrentChatId = forceNewChat
      ? null
      : storeState.currentChatId;
 
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      model: provider,
      status: "completed",
      attachments: attachments,
    };
    const requestId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
    };
    const isCreatingChat = !effectiveCurrentChatId;
    const activeKey = getActiveChatKey(effectiveCurrentChatId);
    const baseMessages = forceNewChat
      ? []
      : optimisticMessagesByChatId[activeKey] ?? storeState.messages;
    const optimisticTitle = createOptimisticTitle(input);
    const abortController = new AbortController();

    if (forceNewChat) {
      setCurrentChat(null);
      setMessages([]);
      setIsNewChat(true);
      navigate("/chat");
    }

    activeAbortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    activeResolvedChatIdRef.current = effectiveCurrentChatId;
 
    // Set optimistic UI
    setOptimisticMessagesForChat(activeKey, [
      ...baseMessages,
      userMessage,
      assistantPlaceholder,
    ]);
 
    setLoading(true);
    setIsStreaming(true, activeKey);
    stopRequestedRef.current = false;
 
    try {
      const url = chatService.getStreamUrl(effectiveCurrentChatId || undefined);
 
      // Client-side safety timeout for connection
      connectionTimeoutRef.current = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          abortController.abort();
          toast.error("Connection timed out. Please try again.");
        }
      }, 35000); // 35s to allow server-side 30s timeout to trigger first
 
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
          message: input,
          provider,
          requestId,
          attachments,
          webSearchEnabled,
        }),
      });
 
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
 
      if (!response.ok) {
        if (
          stopRequestedRef.current &&
          activeRequestIdRef.current === requestId
        ) {
          const resolvedChatId =
            activeResolvedChatIdRef.current ?? effectiveCurrentChatId;
          const key = getActiveChatKey(resolvedChatId);
 
          setOptimisticMessagesByChatId((current) => {
            const messagesForChat = current[key];
            if (!messagesForChat?.length) return current;
            const next = [...messagesForChat];
            next[next.length - 1] = {
              ...next[next.length - 1],
              status: stopRequestedRef.current ? "stopped" : "failed",
            };
            queueMicrotask(() => {
              commitMessagesForChat(resolvedChatId, next);
            });
            return { ...current, [key]: next };
          });
 
          setLoading(false);
          setIsStreaming(false);
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
      if (err instanceof DOMException && err.name === "AbortError") {
        const resolvedChatId =
          activeResolvedChatIdRef.current ?? effectiveCurrentChatId;
        const key = getActiveChatKey(resolvedChatId);
 
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: stopRequestedRef.current ? "stopped" : "failed",
          };
          queueMicrotask(() => {
            commitMessagesForChat(resolvedChatId, next);
          });
          return { ...current, [key]: next };
        });
 
        setLoading(false);
        setIsStreaming(false);
        return;
      }
 
      if (
        stopRequestedRef.current &&
        activeRequestIdRef.current === requestId
      ) {
        const resolvedChatId =
          activeResolvedChatIdRef.current ?? effectiveCurrentChatId;
        const key = getActiveChatKey(resolvedChatId);
 
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
 
        setLoading(false);
        setIsStreaming(false);
        return;
      }

      console.error("Error streaming message", err);
      const resolvedChatId =
        activeResolvedChatIdRef.current ?? effectiveCurrentChatId;
      const key = getActiveChatKey(resolvedChatId);
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
 
      toast.error(errorMessage);
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        activeResolvedChatIdRef.current = null;
        stopRequestedRef.current = false;
 
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
 
        setLoading(false);
        setIsStreaming(false);
      }
    }
  };
 
  const stopGeneration = async () => {
    const requestId = activeRequestIdRef.current;
    const chatId = activeResolvedChatIdRef.current ?? currentChatId;
 
    if (!requestId) return;
 
    stopRequestedRef.current = true;
    markAssistantMessageStatus(chatId, requestId, "stopped");
    activeAbortControllerRef.current?.abort();
 
    try {
      await chatService.stopStream(requestId, chatId);
      if (user?.id) {
        await refreshChats();
        if (chatId) {
          const realMessages = await chatService.fetchMessages(chatId);
          setMessages(realMessages);
          setOptimisticMessagesForChat(chatId, null);
        }
      }
    } catch (err) {
      console.error("Error stopping stream", err);
      toast.error("Could not stop generation cleanly on the server.");
    } finally {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeResolvedChatIdRef.current = null;
      stopRequestedRef.current = false;
      setIsStreaming(false);
      setLoading(false);
    }
  };
 
  const editMessage = async (
    messageId: string,
    newContent: string,
    provider: string,
    options?: {
      webSearchEnabled?: boolean;
    },
  ) => {
    if (!newContent.trim()) return;
    if (!user?.id || !currentChatId) return;

    // If streaming is active, stop it first before editing
    if (activeRequestIdRef.current) {
      await stopGeneration();
    }

    const webSearchEnabled = options?.webSearchEnabled === true;
    const storeState = useChatStore.getState();
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    activeAbortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    activeResolvedChatIdRef.current = currentChatId;

    // Set optimistic UI: find the edited message and remove everything after it
    const currentMessages =
      optimisticMessagesByChatId[getActiveChatKey(currentChatId)] ??
      storeState.messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);

    if (messageIndex === -1) return;

    const editedUserMessage: Message = {
      ...currentMessages[messageIndex],
      content: newContent,
      status: "completed",
    };

    const assistantPlaceholder: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
    };

    const nextMessages = [
      ...currentMessages.slice(0, messageIndex),
      editedUserMessage,
      assistantPlaceholder,
    ];

    setOptimisticMessagesForChat(currentChatId, nextMessages);
    setLoading(true);
    setIsStreaming(true, currentChatId);
    stopRequestedRef.current = false;

    try {
      const url = chatService.getEditStreamUrl(currentChatId, messageId);

      connectionTimeoutRef.current = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          abortController.abort();
          toast.error("Connection timed out. Please try again.");
        }
      }, 35000);

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          content: newContent,
          provider,
          requestId,
          webSearchEnabled,
        }),
      });

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
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
        return;
      }
      console.error("Error editing message", err);
      toast.error(chatService.getChatErrorMessage(err));
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        activeResolvedChatIdRef.current = null;
        setLoading(false);
        setIsStreaming(false);
      }
    }
  };

  return {
    streamMessage,
    editMessage,
    stopGeneration,
    optimisticMessages:
      optimisticMessagesByChatId[getActiveChatKey(currentChatId)] ?? null,
    isStreaming: isStreamingCurrentChat,
    loading: isLoadingCurrentChat,
  };
};
