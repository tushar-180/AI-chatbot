import { useChatStore } from "@/features/chat/store/useChatStore";
import Sidebar from "@/features/chat/components/Sidebar";
import ChatHeader from "@/features/chat/components/ChatHeader";
import MessageList from "@/features/chat/components/MessageList";
import InputArea from "@/features/chat/components/InputArea";
import { useChatMessages } from "@/features/chat/hooks/useChatMessages";
import { useChatStream } from "@/features/chat/hooks/useChatStream";
import { useChatInput } from "@/features/chat/hooks/useChatInput";

/**
 * Chat Page Component
 * Handles the main layout and orchestrates chat logic via custom hooks.
 */
const Chat = () => {
  const { currentChatId, messages, loading, isNewChat, setSidebarOpen } =
    useChatStore();

  // 1. Manage Message Fetching & Sync
  const { messagesLoading, loadedChatId } = useChatMessages();

  // 2. Manage Streaming Logic & Optimistic UI
  const { streamMessage, optimisticMessages, isStreaming } = useChatStream();

  // 3. Manage Input & Form Submission
  const {
    input,
    setInput,
    selectedProvider,
    setSelectedProvider,
    handleFormSubmit,
  } = useChatInput({
    onSubmit: streamMessage,
  });

  // Determine which messages to display (prefer optimistic during streaming)
  const displayMessages = optimisticMessages ?? messages;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex flex-1 flex-col bg-linear-to-br overflow-hidden from-slate-950 via-slate-900/50 to-slate-950">
        <ChatHeader
          currentChatId={currentChatId}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <MessageList
          messages={displayMessages}
          loading={loading}
          messagesLoading={messagesLoading}
          hasLoadedCurrentChat={
            !currentChatId || loadedChatId === currentChatId
          }
          isStreaming={isStreaming}
          currentChatId={currentChatId}
          isNewChat={isNewChat}
          onSuggestionClick={setInput}
        />

        <InputArea
          input={input}
          onInputChange={setInput}
          onSubmit={handleFormSubmit}
          loading={loading}
          currentChatId={currentChatId}
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
        />
      </main>
    </div>
  );
};

export default Chat;
