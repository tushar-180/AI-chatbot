import { useState, useEffect } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { chatService } from "@/features/chat/services/chat.service";
import { toast } from "sonner";
import { useUser } from "@clerk/react";
import axios from "axios";

export const useChatMessages = () => {
  const { currentChatId, isStreaming, streamingChatId, setMessages } =
    useChatStore();
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const { user, isLoaded } = useUser();

  useEffect(() => {
    // 1. If no chat is selected, reset states and return
    if (!currentChatId) {
      queueMicrotask(() => {
        setMessagesLoading(false);
        setLoadedChatId(null);
        setMessagesError(null);
      });
      return;
    }

    // Wait for the authenticated user before attempting an ownership-checked fetch.
    if (!isLoaded) {
      queueMicrotask(() => {
        setMessagesLoading(true);
        setMessagesError(null);
      });
      return;
    }

    if (!user?.id) {
      queueMicrotask(() => {
        setMessages([]);
        setMessagesLoading(false);
        setLoadedChatId(null);
        setMessagesError("Unable to load messages.");
      });
      return;
    }

    // 2. Let the active stream drive the visible messages without forcing a refetch later.
    if (isStreaming && streamingChatId === currentChatId) {
      queueMicrotask(() => {
        setMessagesLoading(false);
        setMessagesError(null);
      });
      return;
    }

    // 3. If the chat is already loaded, don't fetch.
    if (loadedChatId === currentChatId) {
      queueMicrotask(() => {
        setMessagesLoading(false);
      });
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setMessagesLoading(true);
      setMessagesError(null);

      try {
        const messages = await chatService.fetchMessages(currentChatId);

        if (!cancelled) {
          setMessages(messages);
          setLoadedChatId(currentChatId);
        }
      } catch (err) {
        console.error("[useChatMessages] Error fetching messages", err);
        if (!cancelled) {
          setMessages([]);
          setLoadedChatId(null);

          const errorMessage =
            axios.isAxiosError(err) &&
            typeof err.response?.data?.error === "string"
              ? err.response.data.error
              : "Unable to load messages.";

          setMessagesError(errorMessage);
          toast.error(errorMessage);
        }
      } finally {
        if (!cancelled) {
          setMessagesLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [
    currentChatId,
    isLoaded,
    isStreaming,
    streamingChatId,
    loadedChatId,
    setMessages,
    user?.id,
  ]);

  return {
    messagesLoading,
    loadedChatId,
    messagesError,
  };
};
