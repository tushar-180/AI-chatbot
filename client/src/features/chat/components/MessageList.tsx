import { useRef, useEffect, memo } from "react";
import { Code, Lightbulb, PenTool, Terminal } from "lucide-react";
import MessageItem from "./MessageItem";

interface Message {
    role: "user" | "assistant";
    content: string;
    model?: string;
}

const SUGGESTIONS = [
    {
        icon: Code,
        title: "Review code",
        desc: "Optimize and refactor your existing code",
        prompt: "Review the following code and suggest improvements for performance and readability:",
    },
    {
        icon: PenTool,
        title: "Draft an essay",
        desc: "Write engaging and structured content",
        prompt: "Help me write an engaging introduction for a blog post about artificial intelligence.",
    },
    {
        icon: Lightbulb,
        title: "Brainstorm ideas",
        desc: "Generate new and creative concepts",
        prompt: "Give me 5 unique project ideas for a hackathon focused on sustainability.",
    },
    {
        icon: Terminal,
        title: "Debug an error",
        desc: "Fix tricky bugs and understand errors",
        prompt: "I'm getting an error in my code. How do I fix it?",
    },
];

interface MessageListProps {
    messages: Message[];
    loading: boolean;
    messagesLoading: boolean;
    hasLoadedCurrentChat: boolean;
    isStreaming: boolean;
    currentChatId: string | null;
    isNewChat: boolean;
    onSuggestionClick?: (text: string) => void;
}

const MessageList = ({
    messages,
    loading,
    messagesLoading,
    hasLoadedCurrentChat,
    isStreaming,
    currentChatId,
    isNewChat,
    onSuggestionClick,
}: MessageListProps) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const shouldStickToBottomRef = useRef(true);

    const previousChatIdRef = useRef<string | null>(currentChatId);
    const previousMessageCountRef = useRef(messages.length);

    const wasStreamingRef = useRef(isStreaming);
    const streamEndingRef = useRef(false);

    const isNearBottom = () => {
        const container = scrollContainerRef.current;
        if (!container) return true;

        const distanceFromBottom =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight;

        return distanceFromBottom < 96;
    };

    // ✅ FIXED: deterministic scroll (no scrollIntoView)
    const scrollToBottom = (instant = false) => {
        const container = scrollContainerRef.current;
        if (!container) return;

        container.scrollTop = container.scrollHeight;
    };

    const handleScroll = () => {
        shouldStickToBottomRef.current = isNearBottom();
    };

    const showSuggestions = !currentChatId && messages.length === 0 && !loading;

    const showInitialLoading =
        (messagesLoading || (currentChatId && !hasLoadedCurrentChat)) &&
        messages.length === 0;

    const lastMessage = messages[messages.length - 1];

    const showAssistantThinking =
        loading &&
        !isStreaming &&
        messages.length > 0 &&
        lastMessage?.role === "user";

    useEffect(() => {
        if (showSuggestions) return;

        const chatChanged = previousChatIdRef.current !== currentChatId;

        const prevCount = previousMessageCountRef.current;
        const nextCount = messages.length;
        const messageCountIncreased = nextCount > prevCount;

        const streamJustEnded = wasStreamingRef.current && !isStreaming;

        // update refs
        previousChatIdRef.current = currentChatId;
        previousMessageCountRef.current = nextCount;
        wasStreamingRef.current = isStreaming;

        // 🔒 lock scroll during stream end render burst
        if (streamJustEnded) {
            streamEndingRef.current = true;

            requestAnimationFrame(() => {
                streamEndingRef.current = false;
            });
        }

        // switch chat → hard scroll
        if (chatChanged) {
            shouldStickToBottomRef.current = true;
            scrollToBottom(true);
            return;
        }

        // avoid any scroll during stream end flicker
        if (streamEndingRef.current) return;

        // streaming → scroll only if user is at bottom
        if (isStreaming) {
            if (shouldStickToBottomRef.current) {
                scrollToBottom(true);
            }
            return;
        }

        // normal message append → scroll if allowed
        if (messageCountIncreased && shouldStickToBottomRef.current) {
            scrollToBottom(true);
        }
    }, [currentChatId, messages, isStreaming, showSuggestions]);

    return (
        <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className={`flex-1 overflow-y-auto px-4 py-8 md:px-10 [overflow-anchor:none] ${
                showSuggestions ? "scrollbar-hide" : ""
            }`}
        >
            <div className="mx-auto flex max-w-4xl flex-col gap-10">
                {showSuggestions ? (
                    <div className="flex flex-col items-center justify-center py-6 md:py-12 animate-in fade-in duration-1000 w-full">
                        <div className="mb-14 flex flex-col items-center text-center">
                            <img
                                src="/logo.png"
                                alt="Velora"
                                className="h-24 w-24 mb-8"
                            />
                            <h2 className="mb-4 text-3xl md:text-5xl font-bold tracking-tighter text-white">
                                Velora.
                            </h2>
                            <p className="max-w-md text-slate-500 font-medium leading-relaxed tracking-tight">
                                {isNewChat
                                    ? "Welcome to your minimal workspace. Start a new session below."
                                    : "Select a session from the history or begin a new one."}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
                            {SUGGESTIONS.map((s, idx) => (
                                <button
                                    key={idx}
                                    onClick={() =>
                                        onSuggestionClick?.(s.prompt)
                                    }
                                    className="group flex flex-col items-start p-6 text-left bg-white/[0.02] border border-white/[0.05] hover:border-white/20 hover:bg-white/[0.04] rounded-2xl"
                                >
                                    <div className="flex items-center gap-3 mb-3 text-slate-500 group-hover:text-white">
                                        <s.icon size={18} />
                                        <span className="text-[11px] font-bold uppercase tracking-widest">
                                            {s.title}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-600">
                                        {s.desc}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : showInitialLoading ? (
                    <div className="flex w-full justify-start">
                        <div className="flex items-center gap-2 py-4">
                            <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                            <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                            <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((msg, i) => (
                            <MessageItem
                                key={(msg as any).id ?? i}
                                message={msg}
                                isStreaming={
                                    isStreaming && i === messages.length - 1
                                }
                            />
                        ))}

                        {showAssistantThinking && (
                            <div className="flex w-full justify-start">
                                <div className="flex items-center gap-3 py-6">
                                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default memo(MessageList);
