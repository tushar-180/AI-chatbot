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
  const shouldAutoScrollRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef<number | null>(null);
  const userIsInteractingRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);
  const previousChatIdRef = useRef<string | null>(currentChatId);
  const previousIsNewChatRef = useRef(isNewChat);

  const isNearBottom = () => {
    const container = scrollContainerRef.current?.closest('.overflow-y-auto');
    if (!container) return true;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (!scrollContainerRef.current) return;

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

    programmaticScrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimeoutRef.current = null;
      userIsInteractingRef.current = false;
      shouldAutoScrollRef.current = isAtBottom();
    }, behavior === "smooth" ? 250 : 0);
  }, [isAtBottom]);

  const stopProgrammaticScroll = useCallback(() => {
    userIsInteractingRef.current = true;
    isProgrammaticScrollRef.current = false;

    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
      programmaticScrollTimeoutRef.current = null;
    }
  }, []);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const atBottom = isAtBottom();

    if (isProgrammaticScrollRef.current && !userIsInteractingRef.current) {
      if (atBottom) {
        shouldAutoScrollRef.current = true;
      }
      return;
    }

  const lastMessageContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    if (showSuggestions) return;

  useLayoutEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    const previousChatId = previousChatIdRef.current;
    const previousIsNewChat = previousIsNewChatRef.current;

    if (chatChanged || messageCountChanged || (isStreaming && !previousChatIdRef.current)) {
      shouldStickToBottomRef.current = true;
    }

    // Force stick to bottom if we are streaming and currently near bottom
    if (isStreaming && isNearBottom()) {
      shouldStickToBottomRef.current = true;
    }

    previousMessageCountRef.current = messages.length;
    previousChatIdRef.current = currentChatId;
    previousIsNewChatRef.current = isNewChat;
  }, [messages, currentChatId, isNewChat, scrollToBottom]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    userIsInteractingRef.current = false;
  }, [currentChatId, isNewChat]);

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
      <div className="mx-auto   max-w-5xl flex flex-col gap-7">
        {!currentChatId && messages.length === 0 ? (
          <div className="flex w-full animate-in fade-in slide-in-from-bottom-4 flex-col items-center justify-center py-10 duration-700 md:py-20">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900 text-indigo-400 shadow-2xl">
                <Bot size={32} />
              </div>
              <h2 className="mb-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
                How can I help you today?
              </h2>
              <p className="max-w-md leading-relaxed text-slate-400">
                {isNewChat
                  ? "Your new conversation is ready. Choose a suggestion below or send a message to get started."
                  : "Select an existing chat from the sidebar or start a new one to begin brainstorming or asking questions."}
              </p>
            </div>

            <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick?.(suggestion.prompt)}
                  className="group flex flex-col items-start p-6 text-left bg-white/2 border border-white/5 hover:border-white/20 hover:bg-white/4 rounded-2xl transition-all duration-300"
                >
                  <div className="mb-3 flex items-center gap-3 text-slate-400 transition-colors group-hover:text-indigo-400">
                    <div className="rounded-xl bg-slate-800/50 p-2 transition-colors group-hover:bg-indigo-500/10">
                      <suggestion.icon size={20} />
                    </div>
                    <span className="font-medium text-slate-200">
                      {suggestion.title}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 transition-colors group-hover:text-slate-400">
                    {suggestion.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (messagesLoading || (currentChatId && !hasLoadedCurrentChat)) &&
          messages.length === 0 ? (
          <div className="flex w-full animate-in fade-in justify-start duration-300">
            <div className="flex max-w-[85%] flex-row gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-indigo-600/20 text-indigo-400">
                <Bot size={18} className="animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl bg-slate-900/80 px-5 py-4 ring-1 ring-slate-800/60">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></div>
              </div>
            </div>
          </div>
        ) : messages.length === 0 && !loading && !isStreaming ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
            <p>No messages yet. The stage is yours.</p>
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
