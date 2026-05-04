import { useState, useEffect, useRef, useEffectEvent } from "react";
import { useUser } from "@clerk/react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import {
  chatService,
  type Message,
} from "@/features/chat/services/chat.service";
import { toast } from "sonner";

export const useChatStream = () => {
  const { user } = useUser();
  const {
    currentChatId,
    messages,
    loading,
    isStreaming,
    setCurrentChat,
    setMessages,
    setIsNewChat,
    setLoading,
    setIsStreaming,
    upsertChat,
  } = useChatStore();

  const [optimisticMessages, setOptimisticMessages] = useState<
    Message[] | null
  >(null);
  const optimisticMessagesRef = useRef<Message[] | null>(null);
  const optimisticChatIdRef = useRef<string | null>(null);
  const pendingNewChatTitleRef = useRef("");
  const lastResumeAttemptChatIdRef = useRef<string | null>(null);

  const buildLocalChatTitle = (input: string) => {
    const normalized = input.trim().replace(/\s+/g, " ");
    return normalized.length > 60
      ? `${normalized.slice(0, 57).trimEnd()}...`
      : normalized;
  };

  useEffect(() => {
    optimisticMessagesRef.current = optimisticMessages;
  }, [optimisticMessages]);

  // Keep streamed messages mounted for the active chat. Only drop them after the user changes chats.
  useEffect(() => {
    if (isStreaming) return;

    if (!currentChatId) {
      optimisticChatIdRef.current = null;
      queueMicrotask(() => {
        setOptimisticMessages(null);
      });
      return;
    }

    if (optimisticChatIdRef.current && optimisticChatIdRef.current !== currentChatId) {
      optimisticChatIdRef.current = null;
      queueMicrotask(() => {
        setOptimisticMessages(null);
      });
    }
  }, [currentChatId, isStreaming]);

  const processStream = async (
    response: Response,
    isCreatingChat: boolean,
    initialChatId: string | null,
  ) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let resolvedChatId = initialChatId;

    if (!reader) throw new Error("Stream reader unavailable");

    const processEvent = async (rawEvent: string) => {
      const data = chatService.parseStreamEvent(rawEvent);
      if (!data) return;

      if (data.chatId) {
        resolvedChatId = data.chatId;
        optimisticChatIdRef.current = data.chatId;
        if (isCreatingChat) {
          setCurrentChat(data.chatId);
          setIsNewChat(false);
        }
      }

      if (data.model) {
        setOptimisticMessages((current) => {
          if (!current?.length) return current;
          const next = [...current];
          next[next.length - 1] = {
            ...next[next.length - 1],
            model: data.model,
          };
          return next;
        });
      }

      if (data.chunk) {
        fullContent += data.chunk;
        setOptimisticMessages((current) => {
          if (!current?.length) return current;
          const next = [...current];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: fullContent,
          };
          return next;
        });
      }

      if (data.error) toast.error(data.error);

      if (data.done) {
        if (optimisticMessagesRef.current?.length) {
          setMessages(optimisticMessagesRef.current);
        }

        if (resolvedChatId) {
          optimisticChatIdRef.current = resolvedChatId;
          if (isCreatingChat) {
            upsertChat({
              _id: resolvedChatId,
              title: pendingNewChatTitleRef.current,
            });
          }
          setCurrentChat(resolvedChatId);
          setIsNewChat(false);
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

  const resumeCurrentChatStream = useEffectEvent(async (chatId: string) => {
    try {
      const url = chatService.getStreamUpdatesUrl(chatId);
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) return;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("text/event-stream")) {
        return;
      }

      const assistantPlaceholder: Message = {
        role: "assistant",
        content: "",
        model: "gemini",
      };

      optimisticChatIdRef.current = chatId;
      setLoading(true);
      setIsStreaming(true);
      setOptimisticMessages([...messages, assistantPlaceholder]);

      await processStream(response, false, chatId);
    } catch (err) {
      console.error("Error resuming stream", err);
      setLoading(false);
      setIsStreaming(false);
      setOptimisticMessages(null);
    }
  });

  // Attempt to resume stream when chat changes or component mounts
  useEffect(() => {
    if (!currentChatId) {
      lastResumeAttemptChatIdRef.current = null;
      return;
    }

    if (isStreaming) {
      lastResumeAttemptChatIdRef.current = currentChatId;
      return;
    }

    if (lastResumeAttemptChatIdRef.current === currentChatId) {
      return;
    }

    lastResumeAttemptChatIdRef.current = currentChatId;

    // Small timeout to ensure messages are loaded first before attempting recovery
    // This prevents visual glitches where the AI placeholder appears before user messages
    const timer = setTimeout(() => {
      void resumeCurrentChatStream(currentChatId);
    }, 500);

    return () => clearTimeout(timer);
  }, [currentChatId, isStreaming]);


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
    const nextOptimisticChatId = currentChatId;

    pendingNewChatTitleRef.current = isCreatingChat
      ? buildLocalChatTitle(input)
      : "";

    // Set optimistic UI
    optimisticChatIdRef.current = nextOptimisticChatId;
    setOptimisticMessages([...messages, userMessage, assistantPlaceholder]);

    setLoading(true);
    setIsStreaming(true);

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
      setOptimisticMessages(null);
      toast.error(chatService.getChatErrorMessage(err));
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  return {
    streamMessage,
    optimisticMessages,
    isStreaming,
  };
};
