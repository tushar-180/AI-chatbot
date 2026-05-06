import { useChatStore, TEMP_CHAT_ID } from "@/features/chat/store/useChatStore";
import { chatService } from "@/features/chat/services/chat.service";

class ChatStreamManager {
    private controller: AbortController | null = null;

    async startStream({
        chatId,
        userId,
        input,
        provider,
    }: {
        chatId: string | null;
        userId: string;
        input: string;
        provider: string;
    }) {
        const requestId = crypto.randomUUID();
        const store = useChatStore.getState();

        const activeChatId = chatId ?? TEMP_CHAT_ID;

        // ===== optimistic user message =====
        store.addMessage(activeChatId, {
            role: "user",
            content: input,
            model: provider,
            status: "completed",
        });

        // ===== start stream =====
        store.setActiveStream({ requestId, chatId: activeChatId });
        store.setIsStreaming(true, activeChatId);
        store.setLoading(true);

        store.beginStreamingAssistantMessage(activeChatId, {
            id: requestId,
            requestId,
            model: provider,
            content: "",
        });

        this.controller = new AbortController();

        try {
            const response = await fetch(
                chatService.getStreamUrl(chatId || undefined),
                {
                    method: "POST",
                    signal: this.controller.signal,
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                    },
                    body: JSON.stringify({
                        userId,
                        message: input,
                        provider,
                        requestId,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error("Stream request failed");
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No stream reader");

            const decoder = new TextDecoder();

            let buffer = "";
            let fullContent = "";

            let resolvedChatId = activeChatId;
            let lastUpdateTime = Date.now();

            while (true) {
                const { done, value } = await reader.read();

                buffer += decoder.decode(value, { stream: !done });

                const events = buffer.split("\n\n");
                buffer = events.pop() ?? "";

                for (const event of events) {
                    const data = chatService.parseStreamEvent(event);
                    if (!data) continue;

                    // ===== 🔥 HANDLE CHAT ID RESOLUTION =====
                    if (data.chatId && resolvedChatId === TEMP_CHAT_ID) {
                        resolvedChatId = data.chatId;

                        const latest = useChatStore.getState();

                        // move messages from "__new__" → real chatId
                        latest.resolveTempChat(data.chatId);

                        // update stream ownership
                        latest.setIsStreaming(true, data.chatId);
                        latest.setActiveStream({
                            requestId,
                            chatId: data.chatId,
                        });

                        // also create chat in list if needed
                        latest.upsertChat({
                            _id: data.chatId,
                            title: input.slice(0, 40) || "New Chat",
                        });
                    }

                    if (data.chunk) {
                        fullContent += data.chunk;

                        // ✅ Smooth Streaming: Throttle store updates (approx 60fps)
                        const now = Date.now();
                        if (now - lastUpdateTime > 16) {
                            useChatStore
                                .getState()
                                .updateStreamingAssistantMessage(resolvedChatId, {
                                    id: requestId,
                                    content: fullContent,
                                });
                            lastUpdateTime = now;
                        }
                    }

                    if (data.error) {
                        useChatStore
                            .getState()
                            .finalizeStreamingMessage(resolvedChatId, {
                                id: requestId,
                                status: "failed",
                                content: fullContent,
                            });

                        throw new Error(data.error);
                    }

                    if (data.done) {
                        useChatStore
                            .getState()
                            .finalizeStreamingMessage(resolvedChatId, {
                                id: requestId,
                                content: fullContent,
                                status: data.status ?? "completed",
                            });

                        useChatStore.getState().setIsStreaming(false);
                        useChatStore.getState().setLoading(false);
                        useChatStore.getState().clearActiveStream();
                        return;
                    }
                }

                if (done) break;
            }

            // ===== fallback finalize (no done event) =====
            useChatStore.getState().finalizeStreamingMessage(resolvedChatId, {
                id: requestId,
                content: fullContent,
                status: "completed",
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                // Handled in stop()
            } else {
                console.error("Stream error", err);

                useChatStore.getState().finalizeStreamingMessage(activeChatId, {
                    id: requestId,
                    status: "failed",
                });
            }
        } finally {
            const latest = useChatStore.getState();

            latest.setIsStreaming(false);
            latest.setLoading(false);
            latest.clearActiveStream();

            this.controller = null;
        }
    }

    stop() {
        this.controller?.abort();

        const store = useChatStore.getState();
        const { requestId, chatId } = store.activeStream;

        if (requestId) {
            // ✅ Notify server to save partial content and stop AI generation
            chatService.stopStream(requestId, chatId).catch((err) => {
                console.error("[ChatStreamManager] Failed to notify server stop", err);
            });

            if (chatId) {
                store.finalizeStreamingMessage(chatId, {
                    id: requestId,
                    status: "stopped",
                });
            }
        }

        store.setIsStreaming(false);
        store.setLoading(false);
        store.clearActiveStream();

        this.controller = null;
    }
}

export const chatStreamManager = new ChatStreamManager();
