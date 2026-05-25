import { useRef } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";
import { temporaryChatService } from "@/features/chat/services/temporaryChat.service";
import type { Message, WebSource } from "@/features/chat/types/chat.types";
import { API_ORIGIN } from "@/lib/api";

let activeAbortController: AbortController | null = null;
let moduleActiveRequestId: string | null = null;

export const cleanupTemporaryChatStream = () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (moduleActiveRequestId) {
    temporaryChatService.stopStream(moduleActiveRequestId).catch((err) => {
      console.error("Error stopping temporary stream during cleanup:", err);
    });
    moduleActiveRequestId = null;
  }

  try {
    const store = useTemporaryChatStore.getState();
    if (store.isStreaming || store.loading) {
      store.setIsStreaming(false);
      store.setLoading(false);
      store.setRequestId(null);
      store.setMessages((current) =>
        current.map((m) =>
          m.status === "streaming" ? { ...m, status: "stopped" as const } : m
        )
      );
    }
  } catch (err) {
    console.error("Error cleaning up temporary chat store:", err);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (moduleActiveRequestId) {
      const url = `${API_ORIGIN}/api/chat/stop`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: moduleActiveRequestId,
          chatId: `temp_chat_${moduleActiveRequestId}`,
        }),
        keepalive: true,
      }).catch(() => {});
    }
  });
}

const parseClientMultimedia = (content: string) => {
  const markdownImageRegex = /!\[.*?\]\((.*?)\)/g;
  const htmlImageRegex = /<img.*?src=["'](.*?)["'].*?>/g;

  const attachments: any[] = [];
  let imgMatch;

  while ((imgMatch = markdownImageRegex.exec(content)) !== null) {
    const url = imgMatch[1];
    if (url && (url.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(url))) {
      attachments.push({
        url: url,
        name: 'Image',
        mimeType: url.startsWith('data:image') ? url.split(';')[0].split(':')[1] : 'image/remote',
      });
    }
  }

  while ((imgMatch = htmlImageRegex.exec(content)) !== null) {
    const url = imgMatch[1];
    if (url) {
      attachments.push({
        url: url,
        name: 'Image',
        mimeType: url.startsWith('data:image') ? url.split(';')[0].split(':')[1] : 'image/remote',
      });
    }
  }

  return {
    attachments,
    type: attachments.length > 0 ? 'image' : 'text'
  };
};

export const useTemporaryChat = () => {
  const { user } = useUser();
  const { getToken } = useAuth();

  const messages = useTemporaryChatStore((state) => state.messages);
  const loading = useTemporaryChatStore((state) => state.loading);
  const isStreaming = useTemporaryChatStore((state) => state.isStreaming);
  const setMessages = useTemporaryChatStore((state) => state.setMessages);
  const setLoading = useTemporaryChatStore((state) => state.setLoading);
  const setIsStreaming = useTemporaryChatStore((state) => state.setIsStreaming);
  const setRequestId = useTemporaryChatStore((state) => state.setRequestId);
  const activeRequestId = useTemporaryChatStore((state) => state.requestId);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRequestedRef = useRef(false);

  const processStream = async (
    response: Response,
    _requestId: string,
    placeholderMessageId: string,
  ) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";

    if (!reader) throw new Error("Stream reader unavailable");

    let pendingUpdate: {
      content: string;
      attachments: any[];
      type: string;
      status: string;
    } | null = null;
    let pendingFrame: number | null = null;

    const flushUpdate = () => {
      if (!pendingUpdate) return;
      const { content, attachments, type, status } = pendingUpdate;
      setMessages((current) => {
        const next = [...current];
        const assistantIndex = next.findIndex((m) => m.id === placeholderMessageId);
        if (assistantIndex !== -1) {
          next[assistantIndex] = {
            ...next[assistantIndex],
            content,
            status: status as any,
            isWebSearching: false,
            attachments,
            type: type as any,
          };
        }
        return next;
      });
      pendingUpdate = null;
      pendingFrame = null;
    };

    const queueUpdate = (
      content: string,
      attachments: any[],
      type: string,
      status: string,
    ) => {
      pendingUpdate = { content, attachments, type, status };
      if (pendingFrame === null) {
        pendingFrame = requestAnimationFrame(flushUpdate);
      }
    };

    const processEvent = async (rawEvent: string) => {
      const data = temporaryChatService.parseStreamEvent(rawEvent);
      if (!data) return;

      if (data.requestId) {
        activeRequestIdRef.current = data.requestId;
        setRequestId(data.requestId);
      }

      if (data.messageId && data.messageId !== placeholderMessageId) {
        const oldId = placeholderMessageId;
        const newMsgId = data.messageId as string;
        placeholderMessageId = newMsgId;
        setMessages((current) => {
          const next = [...current];
          const assistantIndex = next.findIndex((m) => m.id === oldId);
          if (assistantIndex !== -1) {
            next[assistantIndex] = {
              ...next[assistantIndex],
              id: newMsgId,
            };
          }
          return next;
        });
      }

      if (data.chunk) {
        fullContent += data.chunk;
        const { attachments: parsedAttachments, type: parsedType } = parseClientMultimedia(fullContent);
        queueUpdate(fullContent, parsedAttachments, parsedType, data.status ?? "streaming");
      }

      if (data.error) {
        const errorMessage = data.error;
        setMessages((current) => {
          const next = [...current];
          const assistantIndex = next.findIndex((m) => m.id === placeholderMessageId);
          if (assistantIndex !== -1) {
            next[assistantIndex] = {
              ...next[assistantIndex],
              content: errorMessage,
              status: "failed",
              isWebSearching: false,
            };
          }
          return next;
        });
      }

      if ("sources" in data && data.sources && Array.isArray(data.sources)) {
        const sources = data.sources as WebSource[];
        setMessages((current) => {
          const next = [...current];
          const assistantIndex = next.findIndex((m) => m.id === placeholderMessageId);
          if (assistantIndex !== -1) {
            next[assistantIndex] = {
              ...next[assistantIndex],
              sources,
              isWebSearching: false,
            };
          }
          return next;
        });
      }

      if (data.done) {
        if (pendingFrame !== null) {
          cancelAnimationFrame(pendingFrame);
          pendingFrame = null;
        }
        const { attachments: parsedAttachments, type: parsedType } = parseClientMultimedia(fullContent);
        setMessages((current) => {
          const next = [...current];
          const assistantIndex = next.findIndex((m) => m.id === placeholderMessageId);
          if (assistantIndex !== -1) {
            next[assistantIndex] = {
              ...next[assistantIndex],
              content: fullContent || next[assistantIndex].content,
              status: data.status ?? "completed",
              isWebSearching: false,
              attachments: parsedAttachments,
              type: parsedType as any,
            };
          }
          return next;
        });
        setIsStreaming(false);
        setLoading(false);
        setRequestId(null);
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
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
      setIsStreaming(false);
      setLoading(false);
      setRequestId(null);
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
    }
  };

  const streamMessage = async (
    input: string,
    provider: string,
    attachments: Message["attachments"] = [],
    options?: {
      webSearchEnabled?: boolean;
      attachedFile?: File | null;
    },
  ) => {
    if (!input.trim() && attachments.length === 0) return;
    if (loading || !user?.id) return;

    const webSearchEnabled = options?.webSearchEnabled === true;
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      model: provider,
      status: "completed",
      attachments,
    };

    const assistantPlaceholder: Message = {
      id: requestId,
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
    };

    activeAbortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    activeAbortController = abortController;
    moduleActiveRequestId = requestId;
    setRequestId(requestId);

    const baseMessages = useTemporaryChatStore.getState().messages;
    setMessages([...baseMessages, userMessage, assistantPlaceholder]);
    setLoading(true);
    setIsStreaming(true);
    stopRequestedRef.current = false;

    try {
      const url = temporaryChatService.getTemporaryStreamUrl();

      connectionTimeoutRef.current = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          abortController.abort();
        }
      }, 35000);

      const historyToSend = [...baseMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        model: m.model,
        status: m.status,
      }));

      let body: BodyInit;
      let headers: Record<string, string>;

      if (options?.attachedFile) {
        const formData = new FormData();
        formData.append("file", options.attachedFile);
        formData.append("messages", JSON.stringify(historyToSend));
        formData.append("provider", provider);
        formData.append("requestId", requestId);
        formData.append("webSearchEnabled", String(webSearchEnabled));
        body = formData;
        headers = {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        };
      } else {
        body = JSON.stringify({
          messages: historyToSend,
          provider,
          requestId,
          webSearchEnabled,
        });
        headers = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        };
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: abortController.signal,
        body,
      });

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      if (!response.ok) {
        throw new Error("Failed to connect to temporary stream");
      }

      await processStream(response, requestId, assistantPlaceholder.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((current) => {
          const next = [...current];
          if (next.length > 0) {
            next[next.length - 1] = {
              ...next[next.length - 1],
              status: stopRequestedRef.current ? "stopped" : "failed",
              isWebSearching: false,
            };
          }
          return next;
        });
        setLoading(false);
        setIsStreaming(false);
        setRequestId(null);
        return;
      }

      console.error("Error in temporary stream", err);
      const errorMessage = temporaryChatService.getChatErrorMessage(err);
      setMessages((current) => {
        const next = [...current];
        if (next.length > 0) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: errorMessage,
            status: "failed",
            isWebSearching: false,
          };
        }
        return next;
      });
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        if (activeAbortController === abortController) activeAbortController = null;
        if (moduleActiveRequestId === requestId) moduleActiveRequestId = null;
        setRequestId(null);
        setLoading(false);
        setIsStreaming(false);
      }
    }
  };

  const stopGeneration = async () => {
    const rId = activeRequestIdRef.current || moduleActiveRequestId || activeRequestId;
    if (!rId) return;

    stopRequestedRef.current = true;
    setMessages((current) => {
      const next = [...current];
      const assistantIndex = next.findIndex((m) => m.requestId === rId || m.id === rId);
      if (assistantIndex !== -1) {
        next[assistantIndex] = {
          ...next[assistantIndex],
          status: "stopped",
          isWebSearching: false,
        };
      }
      return next;
    });
    activeAbortControllerRef.current?.abort();

    try {
      await temporaryChatService.stopStream(rId);
    } catch (err) {
      console.error("Error stopping temporary stream", err);
    } finally {
      activeAbortControllerRef.current = null;
      activeRequestIdRef.current = null;
      activeAbortController = null;
      moduleActiveRequestId = null;
      setRequestId(null);
      setLoading(false);
      setIsStreaming(false);
    }
  };

  const editMessage = async (
    messageId: string,
    newContent: string,
    provider: string,
    options?: {
      webSearchEnabled?: boolean;
    },
  ) => {
    if (!newContent.trim()) return;
    if (!user?.id) return;

    if (activeRequestIdRef.current) {
      await stopGeneration();
    }

    const webSearchEnabled = options?.webSearchEnabled === true;
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    activeAbortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    activeAbortController = abortController;
    moduleActiveRequestId = requestId;
    setRequestId(requestId);

    const currentMessages = useTemporaryChatStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const editedUserMessage: Message = {
      ...currentMessages[messageIndex],
      content: newContent,
      status: "completed",
    };

    const assistantPlaceholder: Message = {
      id: requestId,
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
      isWebSearching: webSearchEnabled,
    };

    const nextMessages = [
      ...currentMessages.slice(0, messageIndex),
      editedUserMessage,
      assistantPlaceholder,
    ];

    setMessages(nextMessages);
    setLoading(true);
    setIsStreaming(true);
    stopRequestedRef.current = false;

    try {
      const url = temporaryChatService.getTemporaryStreamUrl();

      connectionTimeoutRef.current = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          abortController.abort();
        }
      }, 35000);

      const historyToSend = [...currentMessages.slice(0, messageIndex), editedUserMessage].map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        model: m.model,
        status: m.status,
      }));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: historyToSend,
          provider,
          requestId,
          webSearchEnabled,
        }),
      });

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      if (!response.ok) {
        throw new Error("Failed to connect to temporary stream");
      }

      await processStream(response, requestId, assistantPlaceholder.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((current) => {
          const next = [...current];
          if (next.length > 0) {
            next[next.length - 1] = {
              ...next[next.length - 1],
              status: stopRequestedRef.current ? "stopped" : "failed",
              isWebSearching: false,
            };
          }
          return next;
        });
        setLoading(false);
        setIsStreaming(false);
        setRequestId(null);
        return;
      }

      console.error("Error editing temporary message", err);
      const errorMessage = temporaryChatService.getChatErrorMessage(err);
      setMessages((current) => {
        const next = [...current];
        if (next.length > 0) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: errorMessage,
            status: "failed",
            isWebSearching: false,
          };
        }
        return next;
      });
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        if (activeAbortController === abortController) activeAbortController = null;
        if (moduleActiveRequestId === requestId) moduleActiveRequestId = null;
        setRequestId(null);
        setLoading(false);
        setIsStreaming(false);
      }
    }
  };

  const retryMessage = async (messageId: string, provider: string) => {
    if (!user?.id) return;

    if (activeRequestIdRef.current) {
      await stopGeneration();
    }

    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    activeAbortControllerRef.current = abortController;
    activeRequestIdRef.current = requestId;
    activeAbortController = abortController;
    moduleActiveRequestId = requestId;
    setRequestId(requestId);

    const currentMessages = useTemporaryChatStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const assistantPlaceholder: Message = {
      id: requestId,
      role: "assistant",
      content: "",
      model: provider,
      requestId,
      status: "streaming",
    };

    const nextMessages = [
      ...currentMessages.slice(0, messageIndex),
      assistantPlaceholder,
    ];

    setMessages(nextMessages);
    setLoading(true);
    setIsStreaming(true);
    stopRequestedRef.current = false;

    try {
      const url = temporaryChatService.getTemporaryStreamUrl();

      connectionTimeoutRef.current = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          abortController.abort();
        }
      }, 35000);

      const historyToSend = currentMessages.slice(0, messageIndex).map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        model: m.model,
        status: m.status,
      }));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${await getToken()}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: historyToSend,
          provider,
          requestId,
          webSearchEnabled: false,
        }),
      });

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      if (!response.ok) {
        throw new Error("Failed to connect to temporary stream");
      }

      await processStream(response, requestId, assistantPlaceholder.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((current) => {
          const next = [...current];
          if (next.length > 0) {
            next[next.length - 1] = {
              ...next[next.length - 1],
              status: stopRequestedRef.current ? "stopped" : "failed",
              isWebSearching: false,
            };
          }
          return next;
        });
        setLoading(false);
        setIsStreaming(false);
        setRequestId(null);
        return;
      }

      console.error("Error retrying temporary message", err);
      const errorMessage = temporaryChatService.getChatErrorMessage(err);
      setMessages((current) => {
        const next = [...current];
        if (next.length > 0) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: errorMessage,
            status: "failed",
            isWebSearching: false,
          };
        }
        return next;
      });
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeAbortControllerRef.current = null;
        activeRequestIdRef.current = null;
        if (activeAbortController === abortController) activeAbortController = null;
        if (moduleActiveRequestId === requestId) moduleActiveRequestId = null;
        setRequestId(null);
        setLoading(false);
        setIsStreaming(false);
      }
    }
  };

  return {
    streamMessage,
    editMessage,
    retryMessage,
    stopGeneration,
    messages,
    isStreaming,
    loading,
  };
};
