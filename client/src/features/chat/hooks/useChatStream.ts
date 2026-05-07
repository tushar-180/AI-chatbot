import { useCallback } from "react";
import { useUser } from "@clerk/react";
import { useMessageStore } from "@/features/chat/store/message.store";
import { useChatStore } from "@/features/chat/store/chat.store";
import { useStreamStore } from "@/features/chat/store/stream.store";
import { chatService } from "@/features/chat/services/chat.service";
import { streamService } from "@/features/chat/services/stream.service";
import {
  createUserMessage,
  createAssistantPlaceholder,
} from "@/features/chat/utils/message.utils";
import { CHAT_TITLE_MAX_LENGTH } from "@/features/chat/constants/chat.constants";
import { toast } from "sonner";
import type { Attachment } from "@/features/chat/hooks/useChatInput";

const createOptimisticTitle = (input: string) =>
  input.trim().slice(0, CHAT_TITLE_MAX_LENGTH) || "New Chat";

export const useChatStream = () => {
  const { user } = useUser();
  const currentChatId = useChatStore((state) => state.currentChatId);
  const targetChatId = currentChatId || "__temp__";

  const addMessage = useMessageStore((state) => state.addMessage);
  const updateMessage = useMessageStore((state) => state.updateMessage);
  const streamsByChatId = useStreamStore((state) => state.streamsByChatId);
  const setStreamStatus = useStreamStore((state) => state.setStreamStatus);

  const streamStatus = streamsByChatId[targetChatId];
  const isStreaming = streamStatus?.isStreaming || false;

  const streamMessage = useCallback(
    async (input: string, provider: string, attachments: Attachment[] = []) => {
      if (!input.trim() && attachments.length === 0) return;
      if (isStreaming || !user?.id) return;

      const userMessage = createUserMessage(input, provider, attachments);
      const requestId = crypto.randomUUID();
      const assistantMessage = createAssistantPlaceholder(provider, requestId);

      const activeKey = currentChatId || "__temp__";
      const optimisticTitle = createOptimisticTitle(input);
      const abortController = new AbortController();

      addMessage(activeKey, userMessage);
      addMessage(activeKey, assistantMessage);

      setStreamStatus(activeKey, {
        isStreaming: true,
        abortController,
        requestId,
      });

      try {
        const url = chatService.getStreamUrl(currentChatId || undefined);
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

        if (!response.ok) {
           throw new Error("Failed to connect to stream");
        }

        await streamService.processStream({
          response,
          initialChatId: currentChatId,
          assistantMessageId: assistantMessage.id!,
          optimisticTitle,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateMessage(activeKey, assistantMessage.id!, (msg) => ({
             ...msg,
             status: "stopped",
          }));
          return;
        }

        console.error("Error streaming message", err);
        updateMessage(activeKey, assistantMessage.id!, (msg) => ({
             ...msg,
             status: "failed",
        }));
        toast.error(chatService.getChatErrorMessage(err));
      } finally {
        setStreamStatus(activeKey, { isStreaming: false, abortController: undefined });
      }
    },
    [
      user,
      currentChatId,
      isStreaming,
      addMessage,
      setStreamStatus,
      updateMessage,
    ]
  );

  const stopGeneration = useCallback(async () => {
    const activeKey = currentChatId || "__temp__";
    const status = useStreamStore.getState().streamsByChatId[activeKey];
    
    if (!status?.requestId) return;

    // Immediately abort local fetch and update local stream state
    useStreamStore.getState().abortStream(activeKey);

    try {
      await chatService.stopStream(status.requestId, currentChatId);
    } catch (err) {
      console.error("Error stopping stream", err);
      toast.error("Could not stop generation cleanly on the server.");
    }
  }, [currentChatId]);

  return {
    streamMessage,
    stopGeneration,
    isStreaming,
    loading: isStreaming, // We map loading to isStreaming for backward compatibility
  };
};
