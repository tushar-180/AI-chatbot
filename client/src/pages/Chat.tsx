import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import ChatHeader from "@/features/chat/components/ChatHeader";
import CompareModeView from "@/features/chat/components/CompareModeView";
import MessageList from "@/features/chat/components/MessageList";
import InputArea from "@/features/chat/components/InputArea";
import SourcesSidebar from "@/features/chat/components/SourceSidebar";
import { useChatMessages } from "@/features/chat/hooks/useChatMessages";
import { useChatStream } from "@/features/chat/hooks/useChatStream";
import {
  useChatInput,
  type Attachment,
} from "@/features/chat/hooks/useChatInput";
import { useChatList } from "@/features/chat/hooks/useChatList";
import { useWebSearchQuota } from "@/features/chat/hooks/useWebSearchQuota";

import type { WebSource } from "@/features/chat/types/chat.types";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";
import {
  useTemporaryChat,
  cleanupTemporaryChatStream,
} from "@/features/chat/hooks/useTemporaryChat";
import { chatService } from "@/features/chat/services/chat.service";
import { useTextSelection } from "@/features/chat/hooks/useTextSelection";
import { SelectionToolbar } from "@/features/chat/components/SelectionToolbar";
import { useComposerStore } from "@/features/chat/store/useComposerStore";
import { useProjectStore } from "@/features/chat/store/useProjectStore";
import { resolveActiveBranch } from "@/features/chat/utils/branchUtils";

/**
 * Chat Page Component
 * Handles the main layout and orchestrates chat logic via custom hooks.
 */
const Chat = () => {
  useTextSelection();
  const { chatId, projectId } = useParams<{
    chatId?: string;
    projectId?: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const hasAutoStartedRef = useRef(false);

  const { setActiveProjectId } = useProjectStore();

  // On page load/refresh: if we're at /projects/:projectId/new (new project chat without
  // a specific chatId), redirect to a normal global new chat instead. This prevents
  // stale project context from persisting across refreshes.
  useEffect(() => {
    if (projectId && !chatId) {
      setActiveProjectId(null);
      navigate("/chat", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync active project state based on URL route parameter
  useEffect(() => {
    if (projectId) {
      setActiveProjectId(projectId);
    } else {
      setActiveProjectId(null);
    }
  }, [projectId, setActiveProjectId]);

  const {
    currentChatId,
    currentChat,
    messages,
    isNewChat,
    setSidebarOpen,
    setCurrentChat,
    setMessages,
    setIsNewChat,
  } = useChatStore();
  const isTemporaryChatActive = useTemporaryChatStore(
    (state) => state.isTemporaryChatActive,
  );
  const clearTemporaryChatStore = useTemporaryChatStore(
    (state) => state.clearStore,
  );
  const pendingState = location.state as {
    pendingInput?: string;
    pendingProvider?: string;
    pendingAttachments?: Attachment[];
    pendingWebSearch?: boolean;
    pendingAttachedFile?: File;
    prefetchedChatId?: string;
    skipInitialFetch?: boolean;
  } | null;
  const { unarchiveChat } = useChatList();
  const canAutoStartFromSeededMessages =
    pendingState?.skipInitialFetch === true &&
    pendingState?.prefetchedChatId === currentChatId;
  const isArchived = currentChat?.isArchived || false;

  // Sources sidebar state
  const [selectedSources, setSelectedSources] = useState<WebSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSources([]);
    setActiveSourceId(null);
    setIsCompareMode(false);
  }, [currentChatId]);

  // Sync URL parameter with store when chatId changes from URL.
  // CRITICAL: Immediately clear messages to prevent leaking between chats.
  useEffect(() => {
    const store = useChatStore.getState();
    const isNavigatingToActiveStream = Boolean(
      chatId && store.streamingChatIds[chatId] === true,
    );

    if (chatId && chatId !== store.currentChatId) {
      setCurrentChat(chatId);
      if (!isNavigatingToActiveStream) {
        setMessages([]);
      }
      setIsNewChat(false);
    } else if (!chatId && store.currentChatId !== null) {
      setCurrentChat(null);
      setMessages([]);
      setIsNewChat(true);
    }
  }, [chatId, projectId, setCurrentChat, setMessages, setIsNewChat]);

  // 1. Manage Message Fetching & Sync
  const { messagesLoading, loadedChatId, messagesError } = useChatMessages({
    skipFetch: canAutoStartFromSeededMessages || isTemporaryChatActive,
  });

  // 2. Manage Web Search Quota
  const {
    quotaStatus,
    isLoading: isQuotaLoading,
    refreshQuota,
  } = useWebSearchQuota();

  // 3. Manage Streaming Logic & Optimistic UI
  const normalStream = useChatStream({
    onWebSearchComplete: refreshQuota,
  });

  const tempStream = useTemporaryChat();

  const activeStream = isTemporaryChatActive ? tempStream : normalStream;

  const {
    streamMessage,
    editMessage,
    retryMessage,
    stopGeneration,
    isStreaming,
    loading: isCurrentChatLoading,
  } = activeStream;

  const displayMessages = isTemporaryChatActive
    ? tempStream.messages
    : (normalStream.optimisticMessages ?? messages);

  // Automatically disable and purge temporary chat mode when navigating to specific chats or unmounting
  useEffect(() => {
    if (isTemporaryChatActive) {
      const path = location.pathname;
      if (chatId || path.includes("/group/")) {
        cleanupTemporaryChatStream();
        useTemporaryChatStore.getState().setTemporaryChatActive(false);
        clearTemporaryChatStore();
      }
    }
  }, [
    chatId,
    location.pathname,
    isTemporaryChatActive,
    clearTemporaryChatStore,
  ]);

  useEffect(() => {
    return () => {
      // Only disable temporary chat if navigating away from the chat feature entirely
      if (
        useTemporaryChatStore.getState().isTemporaryChatActive &&
        !window.location.pathname.startsWith("/chat")
      ) {
        cleanupTemporaryChatStream();
        useTemporaryChatStore.getState().setTemporaryChatActive(false);
        useTemporaryChatStore.getState().clearStore();
      }
    };
  }, []);

  // auto-scroll chat to bottom on new message send

  const messageListRef = useRef<{ instantScrollToBottom: () => void } | null>(
    null,
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    messageListRef.current?.instantScrollToBottom();
    await handleFormSubmit(e);
  };

  // 4. Manage Input & Form Submission
  const {
    input,
    setInput,
    selectedProvider,
    setSelectedProvider,
    attachments,
    setAttachments,
    webSearchEnabled,
    setWebSearchEnabled,
    handleFormSubmit,
  } = useChatInput({
    onSubmit: async (input, provider, attachments, options) => {
      const selectionContext = useComposerStore.getState().selectionContext;
      useComposerStore.getState().clearSelectionContext();
      const res = await streamMessage(input, provider, attachments, {
        forceNewChat: isTemporaryChatActive
          ? false
          : Boolean(messagesError && currentChatId),
        webSearchEnabled: options?.webSearchEnabled,
        selection: selectionContext || undefined,
      });
      return res;
    },
  });

  // 5. Handle auto-start message from SharedChatPage or Project Dashboard
  useEffect(() => {
    const isReady =
      loadedChatId === currentChatId ||
      canAutoStartFromSeededMessages ||
      currentChatId === null;
    if (
      pendingState?.pendingInput &&
      isReady &&
      !isStreaming &&
      !hasAutoStartedRef.current
    ) {
      hasAutoStartedRef.current = true;

      // Clear the state so it doesn't re-trigger on refresh
      navigate(location.pathname, { replace: true, state: {} });

      // Trigger message
      streamMessage(
        pendingState.pendingInput,
        pendingState.pendingProvider || selectedProvider,
        pendingState.pendingAttachments || [],
        {
          webSearchEnabled: pendingState.pendingWebSearch ?? webSearchEnabled,
          attachedFile: pendingState.pendingAttachedFile,
        },
      );
    }
  }, [
    pendingState,
    canAutoStartFromSeededMessages,
    currentChatId,
    loadedChatId,
    isStreaming,
    streamMessage,
    selectedProvider,
    webSearchEnabled,
    navigate,
    location.pathname,
  ]);

  const handleSourcesOpen = useCallback(
    (sources: WebSource[], sourceId?: number) => {
      setSelectedSources(sources);
      setActiveSourceId(sourceId ?? sources[0]?.id ?? null);
    },
    [],
  );

  const handleCitationClick = useCallback((id: number) => {
    setActiveSourceId(id);
  }, []);

  const handleSourcesClose = useCallback(() => {
    setSelectedSources([]);
    setActiveSourceId(null);
  }, []);

  const handleDocumentSubmit = (file: File) => {
    const selectionContext = useComposerStore.getState().selectionContext;
    useComposerStore.getState().clearSelectionContext();
    messageListRef.current?.instantScrollToBottom();
    streamMessage(input, selectedProvider, attachments, {
      forceNewChat: isTemporaryChatActive
        ? false
        : Boolean(messagesError && currentChatId),
      webSearchEnabled,
      selection: selectionContext || undefined,
      attachedFile: file,
    });
    setInput("");
  };

  return (
    <div className="flex flex-1 min-w-0 h-screen overflow-hidden bg-[#09090b] text-zinc-100 font-sans antialiased">
      <main
        className={`relative flex flex-1 flex-col h-screen overflow-hidden transition-all duration-500 ${
          isTemporaryChatActive
            ? "bg-[#09090b] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/10 via-[#09090b] to-[#09090b]"
            : "bg-[#09090b]"
        }`}
      >
        {isCompareMode ? (
          <CompareModeView
            currentChatId={currentChatId}
            selectedProvider={selectedProvider}
            onMenuClick={() => setSidebarOpen(true)}
            onExitCompareMode={() => setIsCompareMode(false)}
          />
        ) : (
          <div
            className={`flex-1 overflow-y-auto flex flex-col relative pb-[15vh] mask-[linear-gradient(to_bottom,black_85%,transparent_98%)] ${isStreaming ? "will-change-scroll" : ""}`}
          >
            <ChatHeader
              currentChatId={currentChatId}
              onMenuClick={() => setSidebarOpen(true)}
              isCompareMode={isCompareMode}
              onCompareToggle={() => setIsCompareMode(!isCompareMode)}
            />

            <div className="relative flex-1">
              {(() => {
                const isTransitioning =
                  (chatId || null) !== currentChatId &&
                  !(
                    !chatId &&
                    currentChatId !== null &&
                    (isStreaming || isCurrentChatLoading)
                  );
                return (
                  <MessageList
                    ref={messageListRef}
                    messages={isTransitioning ? [] : displayMessages}
                    loading={isTransitioning ? false : isCurrentChatLoading}
                    messagesLoading={
                      isTransitioning ? Boolean(chatId) : messagesLoading
                    }
                    messagesError={isTransitioning ? null : messagesError}
                    hasLoadedCurrentChat={
                      isTransitioning
                        ? !chatId
                        : !currentChatId ||
                          loadedChatId === currentChatId ||
                          canAutoStartFromSeededMessages
                    }
                    isStreaming={isTransitioning ? false : isStreaming}
                    currentChatId={
                      isTransitioning ? chatId || null : currentChatId
                    }
                    isNewChat={isTransitioning ? !chatId : isNewChat}
                    onSuggestionClick={setInput}
                    onEditMessage={(messageId, content, options) =>
                      editMessage(
                        messageId,
                        content,
                        options?.provider || selectedProvider,
                        {
                          webSearchEnabled: options?.webSearchEnabled,
                          attachments: options?.attachments,
                          attachedFile: options?.attachedFile,
                          selection: options?.selection,
                        },
                      )
                    }
                    onEditStart={stopGeneration}
                    onFeedback={(messageId, feedback) => {
                      if (isTemporaryChatActive) {
                        useTemporaryChatStore
                          .getState()
                          .setMessageFeedback(messageId, feedback);
                      } else {
                        useChatStore
                          .getState()
                          .setMessageFeedback(messageId, feedback);
                        if (currentChatId) {
                          chatService.updateMessageFeedback(
                            currentChatId,
                            messageId,
                            feedback,
                          );
                        }
                      }
                    }}
                    onRetryMessage={(messageId, provider, webSearchEnabled) =>
                      retryMessage(
                        messageId,
                        provider || selectedProvider,
                        webSearchEnabled,
                      )
                    }
                    onCitationClick={handleCitationClick}
                    onSourcesClick={handleSourcesOpen}
                    onSwitchGeneration={async (newMsg) => {
                      const current = useChatStore.getState().messages;
                      const optimistic = normalStream.optimisticMessages;
                      const base = optimistic ?? current;

                      const updated = base.map((m) => {
                        if (!newMsg.branchId) return m;
                        if (m.branchId === newMsg.branchId) {
                          return { ...m, isActive: m.id === newMsg.id };
                        }
                        return m;
                      });

                      setMessages(updated);

                      if (currentChatId && newMsg.branchId) {
                        chatService.setActiveBranch(
                          currentChatId,
                          newMsg.branchId,
                          newMsg.id,
                        ).catch((err) => {
                          console.error(
                            "Failed to switch active branch on server",
                            err,
                          );
                        });
                      }
                    }}
                  />
                );
              })()}
            </div>
          </div>
        )}

        {!isCompareMode && (
          <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
            <div className="pointer-events-auto">
              <InputArea
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                onSubmitDocument={handleDocumentSubmit}
                loading={isCurrentChatLoading}
                isStreaming={isStreaming}
                onStop={stopGeneration}
                currentChatId={currentChatId}
                selectedProvider={selectedProvider}
                onProviderChange={setSelectedProvider}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={setWebSearchEnabled}
                isArchived={isArchived}
                onUnarchive={() => currentChatId && unarchiveChat(currentChatId)}
                quotaStatus={quotaStatus}
                isQuotaLoading={isQuotaLoading}
              />
            </div>
          </div>
        )}
      </main>

      {selectedSources.length > 0 && (
        <SourcesSidebar
          sources={selectedSources}
          activeId={activeSourceId}
          onSelect={setActiveSourceId}
          onClose={handleSourcesClose}
        />
      )}
      <SelectionToolbar />
    </div>
  );
};

export default Chat;
