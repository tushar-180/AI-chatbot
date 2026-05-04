import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import {
  chatService,
  type Message,
} from "@/features/chat/services/chat.service";
import { toast } from "sonner";

const NEW_CHAT_STREAM_KEY = "__new_chat_stream__";

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
    setLoading,
    setIsStreaming,
  } = useChatStore();

  const [optimisticMessagesByChatId, setOptimisticMessagesByChatId] = useState<
    Record<string, Message[] | null>
  >({});

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

  // Sync optimistic messages with store when the selected chat is not streaming
  useEffect(() => {
    if (!currentChatId) return;
    if (isStreaming && streamingChatId === currentChatId) return;

    queueMicrotask(() => {
      setOptimisticMessagesForChat(currentChatId, null);
    });
  }, [currentChatId, isStreaming, streamingChatId]);

  const refreshChats = async (userId: string, nextChatId?: string) => {
    const chats = await chatService.fetchChats(userId);
    setChats(chats);

    if (nextChatId) {
      setCurrentChat(nextChatId);
      setIsNewChat(false);
    }
  };

  const processStream = async (response: Response, isCreatingChat: boolean, initialChatId: string | null) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let resolvedChatId = initialChatId;
    const initialKey = getActiveChatKey(initialChatId);

    if (!reader) throw new Error("Stream reader unavailable");

    const processEvent = async (rawEvent: string) => {
      const data = chatService.parseStreamEvent(rawEvent);
      if (!data) return;

      if (data.chatId) {
        const nextChatId: string = data.chatId;
        resolvedChatId = nextChatId;
        if (isCreatingChat) {
          setCurrentChat(nextChatId);
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
          };
          return { ...current, [key]: next };
        });
      }

      if (data.error) toast.error(data.error);

      if (data.done) {
        if (user?.id) {
          await refreshChats(user.id, resolvedChatId || undefined);
        }
        setIsStreaming(false);
        setLoading(false);
      }
    };

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
  };

  const resumeStream = async (chatId: string) => {
    try {
      const url = chatService.getStreamUpdatesUrl(chatId);
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) return false;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("text/event-stream")) {
        return false;
      }

      // Add a placeholder message for the incoming stream
      const assistantPlaceholder: Message = {
        role: "assistant",
        content: "",
        model: "gemini", // Will be updated by stream
      };

      setLoading(true);
      setIsStreaming(true, chatId);
      setOptimisticMessagesForChat(chatId, [...messages, assistantPlaceholder]);

      await processStream(response, false, chatId);
      return true;
    } catch (err) {
      console.error("Error resuming stream", err);
      setLoading(false);
      setIsStreaming(false);
      setOptimisticMessagesForChat(chatId, null);
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


  const streamMessage = async (input: string, provider: string) => {
    if (!input.trim() || loading || !user?.id) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      model: provider,
    };
    const assistantPlaceholder: Message = {
      role: "assistant",
      content: "",
      model: provider,
    };
    const isCreatingChat = !currentChatId;
    const activeKey = getActiveChatKey(currentChatId);

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
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          userId: user.id,
          message: input,
          provider,
        }),
      });

      if (!response.ok) throw new Error("Failed to connect to stream");

      await processStream(response, isCreatingChat, currentChatId);
    } catch (err) {
      console.error("Error streaming message", err);
      setOptimisticMessagesForChat(activeKey, null);
      toast.error(chatService.getChatErrorMessage(err));
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  return {
    streamMessage,
    optimisticMessages:
      optimisticMessagesByChatId[getActiveChatKey(currentChatId)] ?? null,
    isStreaming: isStreamingCurrentChat,
  };
};
