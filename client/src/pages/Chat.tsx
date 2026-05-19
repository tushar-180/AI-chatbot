import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import ChatHeader from "@/features/chat/components/ChatHeader";
import MessageList from "@/features/chat/components/MessageList";
import InputArea from "@/features/chat/components/InputArea";
import SourcesSidebar from "@/features/chat/components/SourceSidebar";
import { useChatMessages } from "@/features/chat/hooks/useChatMessages";
import { useChatStream } from "@/features/chat/hooks/useChatStream";
import { useChatInput } from "@/features/chat/hooks/useChatInput";
import { useChatList } from "@/features/chat/hooks/useChatList";
import { useWebSearchQuota } from "@/features/chat/hooks/useWebSearchQuota";
import { Spotlight } from "@/components/ui/spotlight";
import type { WebSource } from "@/features/chat/types/chat.types";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";
import { useTemporaryChat } from "@/features/chat/hooks/useTemporaryChat";
import { TempChatBanner } from "@/features/chat/components/TempChatBanner";
import { chatService } from "@/features/chat/services/chat.service";
import { useTextSelection } from "@/features/chat/hooks/useTextSelection";
import { SelectionToolbar } from "@/features/chat/components/SelectionToolbar";
import { useComposerStore } from "@/features/chat/store/useComposerStore";
import Sidebar from "@/features/chat/components/Sidebar";

/**
 * Chat Page Component
 * Handles the main layout and orchestrates chat logic via custom hooks.
 */
const Chat = () => {
  useTextSelection();
  const { chatId } = useParams<{ chatId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const hasAutoStartedRef = useRef(false);
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
  const isTemporaryChatActive = useTemporaryChatStore((state) => state.isTemporaryChatActive);
  const clearTemporaryChatStore = useTemporaryChatStore((state) => state.clearStore);
  const pendingState = location.state as {
    pendingInput?: string;
    pendingProvider?: string;
    pendingAttachments?: any[];
    pendingWebSearch?: boolean;
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

  useEffect(() => {
    setSelectedSources([]);
    setActiveSourceId(null);
  }, [currentChatId]);

  // Sync URL parameter with store when chatId changes from URL
  useEffect(() => {
    if (chatId && chatId !== currentChatId) {
      setCurrentChat(chatId);
      setMessages([]);
      setIsNewChat(false);
    } else if (!chatId && currentChatId) {
      setCurrentChat(null);
      setMessages([]);
      setIsNewChat(true);
    }
  }, [chatId]);

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
        useTemporaryChatStore.getState().setTemporaryChatActive(false);
        clearTemporaryChatStore();
      }
    }
  }, [chatId, location.pathname, isTemporaryChatActive, clearTemporaryChatStore]);

  useEffect(() => {
    return () => {
      if (useTemporaryChatStore.getState().isTemporaryChatActive) {
        useTemporaryChatStore.getState().setTemporaryChatActive(false);
        useTemporaryChatStore.getState().clearStore();
      }
    };
  }, []);

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
        forceNewChat: isTemporaryChatActive ? false : Boolean(messagesError && currentChatId),
        webSearchEnabled: options?.webSearchEnabled,
        selection: selectionContext || undefined,
      });
      return res;
    },
  });

  // 5. Handle auto-start message from SharedChatPage
  useEffect(() => {
    if (
      pendingState?.pendingInput &&
      (loadedChatId === currentChatId || canAutoStartFromSeededMessages) &&
      currentChatId &&
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
        { webSearchEnabled: pendingState.pendingWebSearch ?? webSearchEnabled },
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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      <Sidebar />

      <main className={`relative flex flex-1 flex-col h-screen overflow-hidden transition-all duration-500 ${
        isTemporaryChatActive
          ? "bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/15 via-slate-950 to-slate-950"
          : "bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]"
      }`}>
        {/* Spotlight Component - Positioned correctly */}
        {!isTemporaryChatActive && (
          <Spotlight
            className="-top-40 left-0 md:-top-20 md:left-60 opacity-60"
            fill="rgba(255, 255, 255, 0.05)"
          />
        )}

        <div
          className={`flex-1 overflow-y-auto scroll-smooth flex flex-col relative pb-[15vh] mask-[linear-gradient(to_bottom,black_85%,transparent_98%)] ${isStreaming ? "will-change-scroll" : ""}`}
        >
          <ChatHeader
            currentChatId={currentChatId}
            onMenuClick={() => setSidebarOpen(true)}
          />

          {isTemporaryChatActive && <TempChatBanner />}

          <div className="relative flex-1">
            <MessageList
              messages={displayMessages}
              loading={isCurrentChatLoading}
              messagesLoading={messagesLoading}
              messagesError={messagesError}
              hasLoadedCurrentChat={
                !currentChatId ||
                loadedChatId === currentChatId ||
                canAutoStartFromSeededMessages
              }
              isStreaming={isStreaming}
              currentChatId={currentChatId}
              isNewChat={isNewChat}
              onSuggestionClick={setInput}
              onEditMessage={(messageId, content) =>
                editMessage(messageId, content, selectedProvider, {
                  webSearchEnabled,
                })
              }
              onEditStart={stopGeneration}
              onFeedback={(messageId, feedback) => {
                if (isTemporaryChatActive) {
                  useTemporaryChatStore.getState().setMessageFeedback(messageId, feedback);
                } else {
                  useChatStore.getState().setMessageFeedback(messageId, feedback);
                  if (currentChatId) {
                    chatService.updateMessageFeedback(currentChatId, messageId, feedback);
                  }
                }
              }}
              onRetryMessage={(messageId) =>
                retryMessage(messageId, selectedProvider)
              }
              onCitationClick={handleCitationClick}
              onSourcesClick={handleSourcesOpen}
            />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
          <div className="pointer-events-auto">
            <InputArea
              input={input}
              onInputChange={setInput}
              onSubmit={handleFormSubmit}
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

        {/* Minimal Noise Overlay for Texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] z-50" />
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
