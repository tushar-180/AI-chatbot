import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import {
  chatService,
  type Message,
} from "@/features/chat/services/chat.service";
import { CHAT_TITLE_MAX_LENGTH } from "@/features/chat/constants/chat.constants";
import { toast } from "sonner";

const NEW_CHAT_STREAM_KEY = "__new_chat_stream__";

const createOptimisticTitle = (input: string) =>
  input.trim().slice(0, CHAT_TITLE_MAX_LENGTH) || "New Chat";

export const useChatStream = () => {
  console.log("Initializing useChatStream hook");
  const { user } = useUser();
  const {
    currentChatId,
    messages,
    loading,
    isStreaming,
    streamingChatId,
    setCurrentChat,
    setChats,
    setIsNewChat,
    upsertChat,
    setMessages,
    setLoading,
    setIsStreaming,
  } = useChatStore();

  const [optimisticMessagesByChatId, setOptimisticMessagesByChatId] = useState<
    Record<string, Message[] | null>
  >({});
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeResolvedChatIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  const setOptimisticMessagesForChat = (
    chatId: string,
    next: Message[] | null,
  ) => {
    setOptimisticMessagesByChatId((current) => ({
      ...current,
      [chatId]: next,
    }));
  };

  const getActiveChatKey = (chatId: string | null) =>
    chatId ?? NEW_CHAT_STREAM_KEY;

  const isStreamingCurrentChat =
    isStreaming &&
    streamingChatId === getActiveChatKey(currentChatId) &&
    !!streamingChatId;
  const isLoadingCurrentChat =
    loading &&
    streamingChatId === getActiveChatKey(currentChatId) &&
    !!streamingChatId;

  // Sync optimistic messages with store when switching chats
  useEffect(() => {
    if (!currentChatId) return;
    if (isStreaming && streamingChatId === currentChatId) return;

    // We only clear optimistic messages when switching chats,
    // allowing the stream handlers to manage their own cleanup.
    setOptimisticMessagesForChat(currentChatId, null);
  }, [currentChatId]);

  const refreshChats = async (userId: string) => {
    const chats = await chatService.fetchChats(userId);
    setChats(chats);
  };

  const commitMessagesForChat = (chatId: string, nextMessages: Message[]) => {
    if (useChatStore.getState().currentChatId === chatId) {
      setMessages(nextMessages);
    }
    setOptimisticMessagesForChat(chatId, nextMessages);
  };

  const processStream = async (
    response: Response,
    isCreatingChat: boolean,
    initialChatId: string | null,
    requestId: string,
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
        }
        setIsStreaming(true, nextChatId);
      }

      if (data.model) {
        const key = resolvedChatId ?? initialKey;
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            model: data.model,
            requestId: activeRequestId,
          };
          return { ...current, [key]: next };
        });
      }

      if (data.chunk) {
        fullContent += data.chunk;
        const key = resolvedChatId ?? initialKey;
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: fullContent,
            requestId: activeRequestId,
            status: data.status ?? "streaming",
          };
          return { ...current, [key]: next };
        });
      }

      if (data.error) {
        toast.error(data.error);
        const key = resolvedChatId ?? initialKey;
        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: "failed",
            requestId: activeRequestId,
          };
          return { ...current, [key]: next };
        });
      }

      if (data.done) {
        // if (user?.id) {
        //   await refreshChats(user.id);
        // }
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
          };
          if (resolvedChatId) {
            const finalChatId = resolvedChatId;
            queueMicrotask(() => {
              commitMessagesForChat(finalChatId, next);
            });
          }
          return { ...current, [key]: next };
        });
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        activeResolvedChatIdRef.current = null;
        stopRequestedRef.current = false;
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
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeResolvedChatIdRef.current = null;
      stopRequestedRef.current = false;
    }
  };

  const resumeStream = async (chatId: string) => {
    try {
      const url = chatService.getStreamUpdatesUrl(chatId);
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;
      activeResolvedChatIdRef.current = chatId;
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        signal: abortController.signal,
      });

      if (!response.ok) return false;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("text/event-stream")) {
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
      setOptimisticMessagesForChat(chatId, [...messages, assistantPlaceholder]);

      await processStream(response, false, chatId, crypto.randomUUID());
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
      return false;
    }
  };

  // Attempt to resume stream when chat changes or component mounts
  useEffect(() => {
    if (currentChatId && !(isStreaming && streamingChatId === currentChatId)) {
      // Small timeout to ensure messages are loaded first before attempting recovery
      // This prevents visual glitches where the AI placeholder appears before user messages
      const timer = setTimeout(() => {
        resumeStream(currentChatId);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentChatId, isStreaming, streamingChatId]);

  const streamMessage = async (
    input: string,
    provider: string,
    attachments: any[] = [],
  ) => {
    if (!input.trim() && attachments.length === 0) return;
    if (loading || !user?.id) return;

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
    };
    const isCreatingChat = !currentChatId;
    const activeKey = getActiveChatKey(currentChatId);
    const optimisticTitle = createOptimisticTitle(input);
    const abortController = new AbortController();

    activeAbortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    activeResolvedChatIdRef.current = currentChatId;

    // Set optimistic UI
    setOptimisticMessagesForChat(activeKey, [
      ...messages,
      userMessage,
      assistantPlaceholder,
    ]);

    setLoading(true);
    setIsStreaming(true, activeKey);

    try {
      const url = chatService.getStreamUrl(currentChatId || undefined);
      
      // Client-side safety timeout for connection
      const connectionTimeout = setTimeout(() => {
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
        },
        signal: abortController.signal,
        body: JSON.stringify({
          userId: user.id,
          message: input,
          provider,
          requestId,
          attachments,
        }),
      });

      clearTimeout(connectionTimeout);

      if (!response.ok) {
        if (
          stopRequestedRef.current &&
          activeRequestIdRef.current === requestId
        ) {
          const resolvedChatId =
            activeResolvedChatIdRef.current ?? currentChatId;
          const key = getActiveChatKey(resolvedChatId);

          setOptimisticMessagesByChatId((current) => {
            const messagesForChat = current[key];
            if (!messagesForChat?.length) return current;
            const next = [...messagesForChat];
            next[next.length - 1] = {
              ...next[next.length - 1],
              status: stopRequestedRef.current ? "stopped" : "failed",
            };
            if (resolvedChatId) {
              queueMicrotask(() => {
                commitMessagesForChat(resolvedChatId, next);
              });
            }
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
        currentChatId,
        requestId,
        optimisticTitle,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const resolvedChatId = activeResolvedChatIdRef.current ?? currentChatId;
        const key = getActiveChatKey(resolvedChatId);

        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: stopRequestedRef.current ? "stopped" : "failed",
          };
          if (resolvedChatId) {
            queueMicrotask(() => {
              commitMessagesForChat(resolvedChatId, next);
            });
          }
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
        const resolvedChatId = activeResolvedChatIdRef.current ?? currentChatId;
        const key = getActiveChatKey(resolvedChatId);

        setOptimisticMessagesByChatId((current) => {
          const messagesForChat = current[key];
          if (!messagesForChat?.length) return current;
          const next = [...messagesForChat];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: "stopped",
          };
          if (resolvedChatId) {
            queueMicrotask(() => {
              commitMessagesForChat(resolvedChatId, next);
            });
          }
          return { ...current, [key]: next };
        });

        setLoading(false);
        setIsStreaming(false);
        return;
      }

      console.error("Error streaming message", err);
      const resolvedChatId = activeResolvedChatIdRef.current ?? currentChatId;
      const key = getActiveChatKey(resolvedChatId);

      setOptimisticMessagesByChatId((current) => {
        const messagesForChat = current[key];
        if (!messagesForChat?.length) return current;
        const next = [...messagesForChat];
        next[next.length - 1] = {
          ...next[next.length - 1],
          status: "failed",
        };
        if (resolvedChatId) {
          queueMicrotask(() => {
            commitMessagesForChat(resolvedChatId, next);
          });
        }
        return { ...current, [key]: next };
      });

      toast.error(chatService.getChatErrorMessage(err));
    } finally {
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeResolvedChatIdRef.current = null;
      stopRequestedRef.current = false;
      setLoading(false);
      setIsStreaming(false);
    }
  };

  const stopGeneration = async () => {
    const requestId = activeRequestIdRef.current;
    const chatId = activeResolvedChatIdRef.current ?? currentChatId;

    if (!requestId) return;

    stopRequestedRef.current = true;
    activeAbortControllerRef.current?.abort();

    try {
      await chatService.stopStream(requestId, chatId);
      if (user?.id) {
        await refreshChats(user.id);
      }
    } catch (err) {
      console.error("Error stopping stream", err);
      toast.error("Could not stop generation cleanly on the server.");
    } finally {
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeResolvedChatIdRef.current = null;
      setIsStreaming(false);
      setLoading(false);
    }
  };

  return {
    streamMessage,
    stopGeneration,
    optimisticMessages:
      optimisticMessagesByChatId[getActiveChatKey(currentChatId)] ?? null,
    isStreaming: isStreamingCurrentChat,
    loading: isLoadingCurrentChat,
  };
};
