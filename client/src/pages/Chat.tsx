import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import Sidebar from "@/features/chat/components/Sidebar";
import ChatHeader from "@/features/chat/components/ChatHeader";
import MessageList from "@/features/chat/components/MessageList";
import InputArea from "@/features/chat/components/InputArea";
import { useChatMessages } from "@/features/chat/hooks/useChatMessages";
import { useChatStream } from "@/features/chat/hooks/useChatStream";
import { useChatInput } from "@/features/chat/hooks/useChatInput";
import { Spotlight } from "@/components/ui/spotlight";

/**
 * Chat Page Component
 * Handles the main layout and orchestrates chat logic via custom hooks.
 */
const Chat = () => {
  const { chatId } = useParams<{ chatId?: string }>();
  const { currentChatId, messages, isNewChat, setSidebarOpen, setCurrentChat, setMessages, setIsNewChat } = useChatStore();

  // Sync URL parameter with store when chatId changes from URL
  useEffect(() => {
    if (chatId && chatId !== currentChatId) {
      setCurrentChat(chatId);
      setMessages([]);
      setIsNewChat(false);
    } else if (!chatId && currentChatId) {
      // If no chatId in URL but currentChatId exists, reset to new chat
      setCurrentChat(null);
      setMessages([]);
      setIsNewChat(true);
    }
  }, [chatId]);

  // 1. Manage Message Fetching & Sync
  const { messagesLoading, loadedChatId, messagesError } = useChatMessages();

  // 2. Manage Streaming Logic & Optimistic UI
  const {
    streamMessage,
    stopGeneration,
    optimisticMessages,
    isStreaming,
    loading: isCurrentChatLoading,
  } = useChatStream();

  // 3. Manage Input & Form Submission
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
    onSubmit: (input, provider, attachments, options) =>
      streamMessage(input, provider, attachments, {
        forceNewChat: Boolean(messagesError && currentChatId),
        webSearchEnabled: options?.webSearchEnabled,
      }),
  });

  // Determine which messages to display (prefer optimistic during streaming)
  const displayMessages = optimisticMessages ?? messages;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      <Sidebar />

      <main className="relative flex flex-1 flex-col h-screen overflow-hidden bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]">
        {/* Spotlight Component - Positioned correctly */}
        <Spotlight
          className="-top-40 left-0 md:-top-20 md:left-60 opacity-60"
          fill="rgba(255, 255, 255, 0.05)"
        />

        <div
          className={`flex-1 overflow-y-auto scroll-smooth flex flex-col relative pb-[15vh] mask-[linear-gradient(to_bottom,black_85%,transparent_98%)] ${isStreaming ? "will-change-scroll" : ""}`}
        >
          <ChatHeader
            currentChatId={currentChatId}
            onMenuClick={() => setSidebarOpen(true)}
          />

          <div className="relative flex-1">
            <MessageList
              messages={displayMessages}
              loading={isCurrentChatLoading}
              messagesLoading={messagesLoading}
              messagesError={messagesError}
              hasLoadedCurrentChat={
                !currentChatId || loadedChatId === currentChatId
              }
              isStreaming={isStreaming}
              currentChatId={currentChatId}
              isNewChat={isNewChat}
              onSuggestionClick={setInput}
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
            />
          </div>
        </div>

        {/* Minimal Noise Overlay for Texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] z-50" />
      </main>
    </div>
  );
};

export default Chat;
