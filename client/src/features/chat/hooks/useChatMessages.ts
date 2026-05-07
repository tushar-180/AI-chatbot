import { useState, useEffect } from "react";
import { useChatStore } from "@/features/chat/store/chat.store";
import { useMessageStore } from "@/features/chat/store/message.store";
import { chatService } from "@/features/chat/services/chat.service";
import { toast } from "sonner";
import { useStreamStore } from "@/features/chat/store/stream.store";

export const useChatMessages = () => {
  const currentChatId = useChatStore((state) => state.currentChatId);
  const reconcileMessages = useMessageStore((state) => state.reconcileMessages);
  const setIsRefreshing = useMessageStore((state) => state.setIsRefreshing);
  
  // Track loading state for completely empty chats
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentChatId) {
      setMessagesLoading(false);
      setLoadedChatId(null);
      return;
    }

    // Read store state imperatively to avoid React re-render subscription loops during streaming
    const messagesByChatId = useMessageStore.getState().messagesByChatId;
    const hasMessages = (messagesByChatId[currentChatId]?.length || 0) > 0;
    const isStreaming = useStreamStore.getState().streamsByChatId[currentChatId]?.isStreaming;

    // Do not block rendering if we already have messages
    if (hasMessages) {
       setLoadedChatId(currentChatId);
    } else {
       setMessagesLoading(true);
    }

    // Skip silent refresh if actively streaming to prevent race conditions
    if (isStreaming) {
       setMessagesLoading(false);
       return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      // Mark as refreshing in background (doesn't trigger full UI blocking loaders)
      if (hasMessages) {
        setIsRefreshing(currentChatId, true);
      }
      
      try {
        const incomingMessages = await chatService.fetchMessages(currentChatId);
        
        if (!cancelled) {
          // Reconcile silently instead of destructive overwrite
          reconcileMessages(currentChatId, incomingMessages);
          setLoadedChatId(currentChatId);
        }
      } catch (err) {
        console.error("[useChatMessages] Error fetching messages", err);
        if (!cancelled && !hasMessages) {
          toast.error("Could not load messages for this chat.");
        }
      } finally {
        if (!cancelled) {
          setMessagesLoading(false);
          setIsRefreshing(currentChatId, false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [currentChatId, reconcileMessages, setIsRefreshing]); // safe dependencies

  return {
    messagesLoading,
    loadedChatId,
  };
};
