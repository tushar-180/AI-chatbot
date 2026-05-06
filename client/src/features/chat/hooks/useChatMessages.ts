import { useState, useEffect, useMemo } from "react";
import { useChatStore, TEMP_CHAT_ID } from "@/features/chat/store/useChatStore";
import { chatService } from "@/features/chat/services/chat.service";
import { toast } from "sonner";

export const useChatMessages = () => {
    const {
        currentChatId,
        messagesByChatId,
        isStreaming,
        streamingChatId,
        setMessages,
    } = useChatStore();

    const [messagesLoading, setMessagesLoading] = useState(false);
    const [loadedChatId, setLoadedChatId] = useState<string | null>(null);

    // ✅ stable selector (prevents unnecessary renders)
    const messages = useMemo(() => {
        const id = currentChatId ?? TEMP_CHAT_ID;
        return messagesByChatId[id] || [];
    }, [currentChatId, messagesByChatId]);

    useEffect(() => {
        // 1. No chat selected OR temp chat → skip fetch
        if (!currentChatId || currentChatId === TEMP_CHAT_ID) {
            setMessagesLoading(false);
            setLoadedChatId(currentChatId ?? TEMP_CHAT_ID);
            return;
        }

        const chatMessages = messagesByChatId[currentChatId] || [];

        const hasMessages = chatMessages.length > 0;

        const hasStreamingMessage = chatMessages.some(
            (m) => m.role === "assistant" && m.status === "streaming",
        );

        const isStreamingThisChat =
            isStreaming && streamingChatId === currentChatId;

        // 2. Streaming in progress → trust local state
        if (isStreamingThisChat || hasStreamingMessage) {
            setLoadedChatId(currentChatId);
            setMessagesLoading(false);
            return;
        }

        // 3. Already loaded → skip fetch
        if (hasMessages && loadedChatId === currentChatId) {
            setMessagesLoading(false);
            return;
        }

        let cancelled = false;

        const loadMessages = async () => {
            setMessagesLoading(true);

            try {
                const fetched = await chatService.fetchMessages(currentChatId);

                if (!cancelled) {
                    setMessages(currentChatId, fetched);
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
    }, [
        currentChatId,
        isStreaming,
        streamingChatId,
        loadedChatId,
        setMessages,
        // ❌ intentionally NOT depending on messagesByChatId
    ]);

    return {
        messages,
        messagesLoading,
        loadedChatId,
    };
};
