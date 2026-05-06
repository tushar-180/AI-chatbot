import { useUser } from "@clerk/react";
import { chatStreamManager } from "@/features/chat/stream/chatStreamManager";
import { useChatStore, TEMP_CHAT_ID } from "@/features/chat/store/useChatStore";

export const useChatStream = () => {
    const { user } = useUser();

    const { currentChatId, isStreaming, loading, streamingChatId } =
        useChatStore();

    const isStreamingCurrentChat =
        isStreaming && streamingChatId === (currentChatId ?? TEMP_CHAT_ID);

    const isLoadingCurrentChat =
        loading && streamingChatId === (currentChatId ?? TEMP_CHAT_ID);

    const streamMessage = async (input: string, provider: string) => {
        if (!user?.id) return;
        if (!input.trim()) return;

        // prevent overlapping streams
        if (isStreaming) return;

        await chatStreamManager.startStream({
            chatId: currentChatId,
            userId: user.id,
            input,
            provider,
        });
    };

    const stopGeneration = () => {
        chatStreamManager.stop();
    };

    return {
        streamMessage,
        stopGeneration,
        isStreaming: isStreamingCurrentChat,
        loading: isLoadingCurrentChat,
    };
};
