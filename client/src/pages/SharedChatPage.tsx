import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser, useClerk } from "@clerk/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
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
    attachments?: any[];
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
                        attachments: msg.attachments || [],
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
                    attachments: msg.attachments || [],
                    status: "completed",
                }),
            );

            upsertChat({
                _id: newChatId,
                title: sharedTitle,
                isArchived: false,
                isPinned: false,
                updatedAt: new Date().toISOString(),
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
            <>
                <main className="relative flex h-screen flex-1 flex-col overflow-hidden bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]">
                    <Spotlight
                        className="-top-40 left-0 opacity-60 md:-top-20 md:left-60"
                        fill="rgba(255, 255, 255, 0.05)"
                    />

                    <div className="relative flex flex-1 flex-col overflow-y-auto scroll-smooth">
                        <ChatHeader
                            currentChatId={null}
                            chatTitle="Shared Chat"
                            onMenuClick={() => setSidebarOpen(true)}
                        />

                        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                            <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900/40 border border-white/5 shadow-2xl backdrop-blur-md space-y-6 animate-in zoom-in-95 duration-300">
                                <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                                    <AlertCircle size={32} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold text-white tracking-wide">Shared Chat Link Expired</h3>
                                    <p className="text-xs text-slate-400 leading-relaxed px-4">
                                        This shared conversation link does not exist, has expired, or was revoked by its creator.
                                    </p>
                                </div>
                                <div className="pt-2">
                                    <button
                                        onClick={() => navigate("/chat")}
                                        className="px-6 py-3 rounded-2xl bg-white text-black font-bold uppercase tracking-widest text-[10px] hover:scale-[1.02] hover:bg-slate-200 transition-all shadow-lg cursor-pointer"
                                    >
                                        Start a New Chat
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]" />
                </main>
            </>
        );
    }

    return (
        <>
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
        </>
    );
}
