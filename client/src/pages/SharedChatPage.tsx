import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser, useClerk } from "@clerk/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Sidebar from "@/features/chat/components/Sidebar";
import ChatHeader from "@/features/chat/components/ChatHeader";
import MessageList from "@/features/chat/components/MessageList";
import InputArea from "@/features/chat/components/InputArea";
import Loading from "@/features/chat/components/Loading";
import { Spotlight } from "@/components/ui/spotlight";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useChatInput } from "@/features/chat/hooks/useChatInput";
import { useWebSearchQuota } from "@/features/chat/hooks/useWebSearchQuota";
import type { Message } from "@/features/chat/types/chat.types";

interface SharedMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
}

export default function SharedChatPage() {
    const { sharedChatId } = useParams<{ sharedChatId: string }>();
    const navigate = useNavigate();
    const { user, isSignedIn } = useUser();
    const { openSignIn } = useClerk();
    const {
        setSidebarOpen,
        setCurrentChat,
        setMessages,
        setIsNewChat,
        upsertChat,
    } = useChatStore();

    const [sharedMessages, setSharedMessages] = useState<SharedMessage[]>([]);
    const [sharedTitle, setSharedTitle] = useState("Shared Chat");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isForking, setIsForking] = useState(false);

    useEffect(() => {
        setCurrentChat(null);
    }, [setCurrentChat]);

    useEffect(() => {
        const fetchSharedChat = async () => {
            try {
                const res = await api.get(`/shared-chat/${sharedChatId}`);
                setSharedTitle(res.data.title || "Shared Chat");
                const msgs = (res.data.messages || []).map(
                    (msg: any, i: number) => ({
                        id: `shared-${i}`,
                        role: msg.role,
                        content: msg.content,
                    }),
                );
                setSharedMessages(msgs);
            } catch (err: any) {
                setError(
                    err.response?.data?.error || "Failed to load shared chat",
                );
            } finally {
                setLoading(false);
            }
        };

        fetchSharedChat();
    }, [sharedChatId]);

    const handleFork = async (
        inputText: string,
        provider: string,
        attachments?: any[],
        options?: any,
    ) => {
        if (!isSignedIn || !user) {
            toast.info("Please sign in to continue this conversation");
            openSignIn();
            return;
        }

        setIsForking(true);

        try {
            const res = await api.post(
                `/shared-chat/${sharedChatId}/fork`,
                {},
                { headers: { "x-user-id": user.id } },
            );

            const { newChatId } = res.data;
            const forkedMessages: Message[] = sharedMessages.map(
                (msg, index) => ({
                    id: `${newChatId}-seed-${index}`,
                    role: msg.role,
                    content: msg.content,
                    status: "completed",
                }),
            );

            upsertChat({
                _id: newChatId,
                title: sharedTitle,
            });
            setCurrentChat(newChatId);
            setMessages(forkedMessages);
            setIsNewChat(false);

            navigate(`/chat/${newChatId}`, {
                replace: true,
                state: {
                    pendingInput: inputText,
                    pendingProvider: provider,
                    pendingAttachments: attachments,
                    pendingWebSearch: options?.webSearchEnabled,
                    prefetchedChatId: newChatId,
                    skipInitialFetch: true,
                },
            });
        } catch (err) {
            toast.error("Failed to continue conversation");
            setIsForking(false);
        }
    };

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
        onSubmit: handleFork,
    });

    const {
        quotaStatus,
        isLoading: isQuotaLoading,
    } = useWebSearchQuota();

    if (loading) return <Loading />;

    if (error) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#030712] p-4 text-center">
                <h2 className="mb-4 text-2xl font-bold text-white">
                    Chat Not Found
                </h2>
                <p className="mb-8 max-w-md text-slate-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
            <Sidebar />

            <main className="relative flex h-screen flex-1 flex-col overflow-hidden bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]">
                <Spotlight
                    className="-top-40 left-0 opacity-60 md:-top-20 md:left-60"
                    fill="rgba(255, 255, 255, 0.05)"
                />

                <div className="relative flex flex-1 flex-col overflow-y-auto scroll-smooth pb-[15vh]">
                    <ChatHeader
                        currentChatId={null}
                        chatTitle="Shared Chat"
                        onMenuClick={() => setSidebarOpen(true)}
                    />

                    <div className="relative flex-1">
                        <MessageList
                            messages={sharedMessages}
                            loading={false}
                            messagesLoading={false}
                            messagesError={null}
                            hasLoadedCurrentChat={true}
                            isStreaming={false}
                            currentChatId={null}
                            isNewChat={false}
                            onSuggestionClick={setInput}
                        />
                    </div>
                </div>

                <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-30">
                    <div className="pointer-events-auto">
                        <InputArea
                            input={input}
                            onInputChange={setInput}
                            onSubmit={handleFormSubmit}
                            loading={isForking}
                            isStreaming={false}
                            onStop={() => {}}
                            currentChatId={null}
                            selectedProvider={selectedProvider}
                            onProviderChange={setSelectedProvider}
                            attachments={attachments}
                            onAttachmentsChange={setAttachments}
                            webSearchEnabled={webSearchEnabled}
                            onWebSearchToggle={setWebSearchEnabled}
                            quotaStatus={quotaStatus}
                            isQuotaLoading={isQuotaLoading}
                        />
                    </div>
                </div>

                <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]" />
            </main>
        </div>
    );
}
