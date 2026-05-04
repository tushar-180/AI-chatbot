import { useState, useEffect } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { chatService } from "@/features/chat/services/chat.service";
import { toast } from "sonner";

export const useChatMessages = () => {
  const { currentChatId, isStreaming, messages, setMessages } = useChatStore();
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);

  useEffect(() => {
    // 1. If no chat is selected, reset states and return
    if (!currentChatId) {
      queueMicrotask(() => {
        setMessagesLoading(false);
        setLoadedChatId(null);
      });
      return;
    }

    // 2. Never fetch while the active chat is still streaming.
    if (isStreaming) {
      return;
    }

    // 3. If this chat already has local streamed messages, keep them until the user changes chats.
    if (loadedChatId !== currentChatId && messages.length > 0) {
      queueMicrotask(() => {
        setLoadedChatId(currentChatId);
        setMessagesLoading(false);
      });
      return;
    }

    // 4. If the chat is already loaded, don't fetch.
    if (loadedChatId === currentChatId) {
      queueMicrotask(() => {
        setMessagesLoading(false);
      });
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setMessagesLoading(true);
      
      try {
        const messages = await chatService.fetchMessages(currentChatId);
        
        if (!cancelled) {
          setMessages(messages);
          setLoadedChatId(currentChatId);
        }
      } catch (err) {
        console.error("[useChatMessages] Error fetching messages", err);
        if (!cancelled) {
          toast.error("Could not load messages for this chat.");
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
    }, [currentChatId, isStreaming, loadedChatId, messages.length, setMessages]);

  return {
    messagesLoading,
    loadedChatId,
  };
};
