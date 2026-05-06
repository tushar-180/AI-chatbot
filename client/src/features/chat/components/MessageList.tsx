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
    prompt:
      "Review the following code and suggest improvements for performance and readability:",
  },
  {
    icon: PenTool,
    title: "Draft an essay",
    desc: "Write engaging and structured content",
    prompt:
      "Help me write an engaging introduction for a blog post about artificial intelligence.",
  },
  {
    icon: Lightbulb,
    title: "Brainstorm ideas",
    desc: "Generate new and creative concepts",
    prompt:
      "Give me 5 unique project ideas for a hackathon focused on sustainability.",
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousChatIdRef = useRef<string | null>(currentChatId);
  const previousMessageCountRef = useRef(messages.length);

  const isNearBottom = () => {
    const container = scrollContainerRef.current?.closest('.overflow-y-auto');
    if (!container) return true;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    return distanceFromBottom < 250;
  };

  const scrollToBottom = (instant = false) => {
    const container = scrollContainerRef.current?.closest('.overflow-y-auto');
    if (!container) return;

    const scrollOptions = {
      top: container.scrollHeight,
      behavior: (instant ? "auto" : "smooth") as ScrollBehavior,
    };

    requestAnimationFrame(() => {
      container.scrollTo(scrollOptions);
    });
  };

  const handleScroll = () => {
    shouldStickToBottomRef.current = isNearBottom();
  };

  // Unified State Logic
  const showSuggestions = !currentChatId && messages.length === 0 && !loading;
  const showInitialLoading = (messagesLoading || (currentChatId && !hasLoadedCurrentChat)) && messages.length === 0;
  const showAssistantThinking = loading && !isStreaming && messages.length > 0 && messages[messages.length-1].role === "user";

  const lastMessageContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    if (showSuggestions) return;

    const chatChanged = previousChatIdRef.current !== currentChatId;
    const messageCountChanged =
      previousMessageCountRef.current !== messages.length;

    if (chatChanged || messageCountChanged || (isStreaming && !previousChatIdRef.current)) {
      shouldStickToBottomRef.current = true;
    }

    // Force stick to bottom if we are streaming and currently near bottom
    if (isStreaming && isNearBottom()) {
      shouldStickToBottomRef.current = true;
    }

    previousChatIdRef.current = currentChatId;
    previousMessageCountRef.current = messages.length;

    if (isStreaming && !shouldStickToBottomRef.current) return;

    scrollToBottom(isStreaming);
  }, [currentChatId, messages, isStreaming, showSuggestions, loading, lastMessageContent]);

  useEffect(() => {
    const mainContainer = scrollContainerRef.current?.closest('.overflow-y-auto');
    if (!mainContainer) return;

    mainContainer.addEventListener("scroll", handleScroll);
    return () => mainContainer.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      className={`px-4 py-8 md:px-10 [overflow-anchor:none] ${
        showSuggestions ? "scrollbar-hide" : ""
      }`}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        {showSuggestions ? (
          <div className="flex flex-col items-center justify-center py-6 md:py-12 animate-in fade-in duration-1000 w-full">
            <div className="mb-14 flex flex-col items-center text-center">
              <img src="/logo.png" alt="Velora" className="h-24 w-24 mb-8" />
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
              {SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick?.(suggestion.prompt)}
                  className="group flex flex-col items-start p-6 text-left bg-white/2 border border-white/5 hover:border-white/20 hover:bg-white/4 rounded-2xl transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-3 text-slate-500 group-hover:text-white transition-colors">
                    <suggestion.icon size={18} />
                    <span className="text-[11px] font-bold uppercase tracking-widest">
                      {suggestion.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 group-hover:text-slate-400 transition-colors leading-relaxed">
                    {suggestion.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : showInitialLoading ? (
          <div className="flex w-full justify-start animate-in fade-in duration-300">
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
                key={i}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1}
              />
            ))}

            {showAssistantThinking && (
              <div className="flex w-full justify-start animate-in fade-in duration-300">
                <div className="flex items-center gap-3 py-6">
                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
};

export default memo(MessageList);
