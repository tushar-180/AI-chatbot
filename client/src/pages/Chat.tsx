import { useChatStore, TEMP_CHAT_ID } from "@/features/chat/store/useChatStore";
import Sidebar from "@/features/chat/components/Sidebar";
import ChatHeader from "@/features/chat/components/ChatHeader";
import MessageList from "@/features/chat/components/MessageList";
import InputArea from "@/features/chat/components/InputArea";
import { useChatMessages } from "@/features/chat/hooks/useChatMessages";
import { useChatStream } from "@/features/chat/hooks/useChatStream";
import { useChatInput } from "@/features/chat/hooks/useChatInput";
import { Spotlight } from "@/components/ui/spotlight";

const Chat = () => {
    const { currentChatId, isNewChat, setSidebarOpen } = useChatStore();

    const { messages, messagesLoading, loadedChatId } = useChatMessages();

    const {
        streamMessage,
        stopGeneration,
        isStreaming,
        loading: isCurrentChatLoading,
    } = useChatStream();

    const {
        input,
        setInput,
        selectedProvider,
        setSelectedProvider,
        attachments,
        setAttachments,
        handleFormSubmit,
    } = useChatInput({
        onSubmit: streamMessage,
    });

    // ✅ normalize for correct comparison
    const normalizedCurrent =
        currentChatId ?? (isNewChat ? TEMP_CHAT_ID : null);

    const hasLoadedCurrentChat =
        !normalizedCurrent || loadedChatId === normalizedCurrent;

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-white/10 antialiased">
            <Sidebar />

            <main className="relative flex flex-1 flex-col overflow-hidden bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]">
                <Spotlight
                    className="-top-40 left-0 md:-top-20 md:left-60 opacity-60"
                    fill="rgba(255, 255, 255, 0.05)"
                />

                <ChatHeader
                    currentChatId={currentChatId}
                    onMenuClick={() => setSidebarOpen(true)}
                />

                <div className="flex-1 relative flex flex-col overflow-hidden">
                    <MessageList
                        messages={messages}
                        loading={isCurrentChatLoading}
                        messagesLoading={messagesLoading}
                        hasLoadedCurrentChat={hasLoadedCurrentChat}
                        isStreaming={isStreaming}
                        currentChatId={currentChatId}
                        isNewChat={isNewChat}
                        onSuggestionClick={setInput}
                    />
                </div>

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
                />
            </main>
        </div>
    );
};

export default Chat;
