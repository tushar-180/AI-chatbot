import { useRef, useEffect, useLayoutEffect, useCallback, memo } from "react";
import { Bot, Code, Lightbulb, PenTool, Terminal } from "lucide-react";
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

  const isAtBottom = useCallback(() => {
    if (!scrollContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // Consider "at bottom" if within 50px of the bottom
    return scrollHeight - (scrollTop + clientHeight) < 50;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (!scrollContainerRef.current) return;

    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
    }

    isProgrammaticScrollRef.current = true;
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior,
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

  // Handle user scroll - detect if scrolling up or if reached bottom
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const atBottom = isAtBottom();

    if (isProgrammaticScrollRef.current && !userIsInteractingRef.current) {
      if (atBottom) {
        shouldAutoScrollRef.current = true;
      }
      return;
    }

    const wasAutoScrollEnabled = shouldAutoScrollRef.current;

    shouldAutoScrollRef.current = atBottom;

    if (atBottom && !wasAutoScrollEnabled) {
      userIsInteractingRef.current = false;
      scrollToBottom("auto");
    }
  };

  useLayoutEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    const previousChatId = previousChatIdRef.current;
    const previousIsNewChat = previousIsNewChatRef.current;

    const hasNewMessageStarted = messages.length > previousMessageCount;
    const chatChanged = currentChatId !== previousChatId;
    const newChatStarted = isNewChat && !previousIsNewChat;
    const shouldJumpToBottom = chatChanged || newChatStarted || hasNewMessageStarted;

    if (shouldJumpToBottom || shouldAutoScrollRef.current) {
      scrollToBottom(shouldJumpToBottom ? "smooth" : "auto");
    }

    previousMessageCountRef.current = messages.length;
    previousChatIdRef.current = currentChatId;
    previousIsNewChatRef.current = isNewChat;
  }, [messages, currentChatId, isNewChat, scrollToBottom]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    userIsInteractingRef.current = false;
  }, [currentChatId, isNewChat]);

  useEffect(() => {
    return () => {
      if (programmaticScrollTimeoutRef.current) {
        window.clearTimeout(programmaticScrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      onWheel={stopProgrammaticScroll}
      onTouchStart={stopProgrammaticScroll}
      onMouseDown={stopProgrammaticScroll}
      className="flex-1 overflow-y-auto px-4 py-8 md:px-6 [overflow-anchor:none]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-7">
        {!currentChatId && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 md:py-20 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-900 border border-slate-800 text-indigo-400 shadow-2xl">
                <Bot size={32} />
              </div>
              <h2 className="mb-3 text-2xl md:text-3xl font-bold tracking-tight text-white">
                How can I help you today?
              </h2>
              <p className="max-w-md text-slate-400 leading-relaxed">
                {isNewChat
                  ? "Your new conversation is ready. Choose a suggestion below or send a message to get started."
                  : "Select an existing chat from the sidebar or start a new one to begin brainstorming or asking questions."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
              {SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick?.(suggestion.prompt)}
                  className="group flex flex-col items-start p-5 text-left bg-slate-900/40 border border-slate-800/60 hover:border-indigo-500/50 hover:bg-slate-800/40 hover:shadow-lg hover:shadow-indigo-500/5 rounded-2xl transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-3 text-slate-400 group-hover:text-indigo-400 transition-colors">
                    <div className="p-2 rounded-xl bg-slate-800/50 group-hover:bg-indigo-500/10 transition-colors">
                      <suggestion.icon size={20} />
                    </div>
                    <span className="font-medium text-slate-200">
                      {suggestion.title}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">
                    {suggestion.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (messagesLoading || (currentChatId && !hasLoadedCurrentChat)) &&
          messages.length === 0 ? (
          <div className="flex w-full justify-start animate-in fade-in duration-300">
            <div className="flex max-w-[85%] gap-3 flex-row">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-slate-700">
                <Bot size={18} className="animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 py-2">
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
          messages.map((msg, i) => (
            <MessageItem
              key={i}
              message={msg}
              isStreaming={isStreaming && i === messages.length - 1}
            />
          ))
        )}

        {/* AI Typing Indicator - only show when loading but NOT yet streaming */}
        {loading && !isStreaming && (
          <div className="flex w-full justify-start animate-in fade-in duration-300">
            <div className="flex max-w-[85%] gap-3 flex-row">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-slate-700">
                <Bot size={18} className="animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 py-2">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MessageList);
