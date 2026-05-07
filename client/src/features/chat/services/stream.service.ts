import { toast } from "sonner";
import { chatService } from "@/features/chat/services/chat.service";
import { useMessageStore } from "@/features/chat/store/message.store";
import { useChatStore } from "@/features/chat/store/chat.store";
import { useStreamStore } from "@/features/chat/store/stream.store";
import { parseStreamEvent } from "@/features/chat/utils/stream.utils";
import { StreamBufferService } from "./streamBuffer.service";

export const streamService = {
  /**
   * Processes the stream response, updates message contents,
   * handles new chat creation if required, and returns the final chatId.
   */
  async processStream({
    response,
    initialChatId,
    assistantMessageId,
    optimisticTitle,
  }: {
    response: Response;
    initialChatId: string | null;
    assistantMessageId: string;
    optimisticTitle?: string;
  }): Promise<string | null> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Stream reader unavailable");

    let fullContent = "";
    let buffer = "";
    let activeChatId = initialChatId;
    let isInitialChatCreationDone = false;
    let requestId = "";

    const streamBuffer = new StreamBufferService((accumulatedChunk) => {
      fullContent += accumulatedChunk;
      const targetChatId = activeChatId || "__temp__";
      useMessageStore.getState().updateMessage(targetChatId, assistantMessageId, (msg) => ({
        ...msg,
        content: fullContent,
        requestId,
        status: "streaming",
      }));
    });

    const processEvent = async (rawEvent: string) => {
      const data = parseStreamEvent(rawEvent);
      if (!data) return;

      if (data.requestId) {
        requestId = data.requestId;
        useStreamStore.getState().setStreamStatus(activeChatId || "__temp__", {
          requestId: data.requestId,
        });
      }

      if (data.chatId) {
        const nextChatId = data.chatId;

        if (!activeChatId) {
          activeChatId = nextChatId;
          const { upsertChat, setIsNewChat, setCurrentChat, currentChatId } = useChatStore.getState();
          const { messagesByChatId, setMessages, removeChatMessages } = useMessageStore.getState();

          upsertChat({
            _id: nextChatId,
            title: optimisticTitle || "New Chat",
          });
          setIsNewChat(false);

          if (currentChatId === null) {
            setCurrentChat(nextChatId);
          }

          const tempMessages = messagesByChatId["__temp__"] || [];
          if (tempMessages.length > 0) {
            setMessages(nextChatId, tempMessages);
            removeChatMessages("__temp__");
          }

          useStreamStore.getState().setStreamStatus(nextChatId, {
             isStreaming: true,
             requestId,
          });
          isInitialChatCreationDone = true;
        }
      }

      const targetChatId = activeChatId || "__temp__";

      if (data.model) {
        useMessageStore.getState().updateMessage(targetChatId, assistantMessageId, (msg) => ({
          ...msg,
          model: data.model,
          requestId,
        }));
      }

      if (data.chunk) {
        streamBuffer.append(data.chunk);
      }

      if (data.error) {
        toast.error(data.error);
      }

      if (data.done) {
        streamBuffer.flush();
        useMessageStore.getState().updateMessage(targetChatId, assistantMessageId, (msg) => ({
          ...msg,
          content: fullContent || msg.content,
          requestId,
          status: data.status ?? "completed",
        }));

        if (activeChatId) {
           useStreamStore.getState().setStreamStatus(activeChatId, {
            isStreaming: false,
            status: "completed",
            requestId: undefined,
            abortController: undefined,
          });
        }
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
       streamBuffer.destroy();
       const targetChatId = activeChatId || "__temp__";
       useStreamStore.getState().setStreamStatus(targetChatId, {
          isStreaming: false,
       });
    }

    return activeChatId;
  },
};
