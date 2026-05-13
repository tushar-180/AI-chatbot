import {
  useRef,
  useEffect,
  useCallback,
  memo,
  useState,
  useLayoutEffect,
} from "react";
import { ChevronDown, Code, Lightbulb, PenTool, Terminal } from "lucide-react";

import MessageItem from "./MessageItem";

interface Message {
  id: string;
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
  messagesError: string | null;
  hasLoadedCurrentChat: boolean;
  isStreaming: boolean;
  currentChatId: string | null;
  isNewChat: boolean;
  onSuggestionClick?: (text: string) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onEditStart?: () => void;
}

const MessageList = ({
  messages,
  loading,
  messagesLoading,
  messagesError,
  hasLoadedCurrentChat,
  isStreaming,
  currentChatId,
  isNewChat,
  onSuggestionClick,
  onEditMessage,
  onEditStart,
}: MessageListProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Track if user manually scrolled up
  const shouldAutoScrollRef = useRef(true);

  // Track previous values
  const prevChatIdRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(0);

  // GET REAL SCROLL CONTAINER

  const getScrollContainer = useCallback(() => {
    return scrollContainerRef.current?.closest(
      ".overflow-y-auto",
    ) as HTMLDivElement | null;
  }, []);

  // CHECK IF USER IS NEAR BOTTOM

  const isAtBottom = useCallback(() => {
    const container = getScrollContainer();

    if (!container) return true;

    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      120
    );
  }, [getScrollContainer]);

  // SCROLL TO BOTTOM
  const scrollToBottom = useCallback(
    (smooth = false) => {
      const container = getScrollContainer();

      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [getScrollContainer],
  );

  // HANDLE SCROLL

  const handleScroll = useCallback(() => {
    const atBottom = isAtBottom();

    shouldAutoScrollRef.current = atBottom;

    setShowScrollToBottom(!atBottom);
  }, [isAtBottom]);

  // ATTACH SCROLL LISTENER
  useEffect(() => {
    const container = getScrollContainer();

    if (!container) return;

    container.addEventListener("scroll", handleScroll);

    // Initial check
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [getScrollContainer, handleScroll]);

  // AUTO SCROLL ON:
  // 1. NEW MESSAGE
  // 2. CHAT SWITCH
  // 3. PAGE REFRESH
  useLayoutEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current;

    const chatChanged = currentChatId !== prevChatIdRef.current;

    // Always scroll when:
    // - opening another chat
    // - refreshing/loading chat
    // - sending new message while already at bottom
    if (
      chatChanged ||
      (!messagesLoading && shouldAutoScrollRef.current && messageCountChanged)
    ) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }

    prevMessageCountRef.current = messages.length;
    prevChatIdRef.current = currentChatId;
  }, [messages, currentChatId, messagesLoading, scrollToBottom]);

  // FORCE SCROLL AFTER CHAT LOAD
  useEffect(() => {
    if (hasLoadedCurrentChat && messages.length > 0 && !messagesLoading) {
      const timeout = setTimeout(() => {
        scrollToBottom(false);
      }, 50);

      return () => clearTimeout(timeout);
    }
  }, [
    hasLoadedCurrentChat,
    currentChatId,
    messages.length,
    messagesLoading,
    scrollToBottom,
  ]);

  const showSuggestions = !currentChatId && messages.length === 0;

  return (
    <div
      ref={scrollContainerRef}
      className={`px-4 py-8 md:px-10 [overflow-anchor:none] ${
        showSuggestions ? "scrollbar-hide" : ""
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-7">
        {showSuggestions ? (
          <div className="flex w-full animate-in fade-in slide-in-from-bottom-4 flex-col items-center justify-center py-10 duration-700 md:py-20">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 flex items-center justify-center">
                <img
                  src="/logo.png"
                  alt="Velora Logo"
                  className="h-24 w-24 object-contain object-center"
                />
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
                  className="group flex flex-col items-start rounded-2xl border border-white/5 bg-white/2 p-6 text-left transition-all duration-300 hover:border-white/20 hover:bg-white/4"
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
        ) : messagesError && currentChatId && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-base font-medium text-slate-200">
              Unable to load messages
            </p>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              {messagesError}
            </p>
          </div>
        ) : (messagesLoading || (currentChatId && !hasLoadedCurrentChat)) &&
          messages.length === 0 ? (
          <div className="flex w-full animate-in fade-in justify-start duration-300">
            <div className="flex max-w-[85%] flex-row gap-3">
              <div className="flex shrink-0 items-center justify-center">
                <img
                  src="/logo.png"
                  alt="Velora Logo"
                  className="h-7 w-7 animate-pulse object-contain"
                />
              </div>

              <div className="flex items-center gap-1.5 rounded-2xl bg-slate-900/80 px-5 py-4 ring-1 ring-slate-800/60">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
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
              <div key={msg.id}>
                <MessageItem
                  message={msg}
                  isStreaming={isStreaming && i === messages.length - 1}
                  isAnyStreaming={isStreaming}
                  onEdit={(content) => onEditMessage?.(msg.id, content)}
                  onEditStart={onEditStart}
                />
              </div>
            ))}

            {isStreaming &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "user" && (
                <div className="flex w-full justify-start duration-300">
                  <div className="flex items-center gap-3 py-6">
                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse [animation-delay:100ms]" />
                    <div className="h-1 w-1 rounded-full bg-white/40 animate-pulse [animation-delay:200ms]" />
                  </div>
                </div>
              )}

            {/* SCROLL TO BOTTOM BUTTON */}
            {showScrollToBottom && messages.length > 0 && (
              <div className="pointer-events-none sticky bottom-10 z-20 flex justify-center animate-in fade-in slide-in-from-bottom-3 duration-300">
                <button
                  type="button"
                  onClick={() => {
                    shouldAutoScrollRef.current = true;
                    scrollToBottom(true);
                  }}
                  aria-label="Scroll to bottom"
                  className="pointer-events-auto flex h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 px-3 text-slate-200 shadow-lg shadow-black/30 backdrop-blur transition-all duration-200 hover:scale-110 hover:border-white/20 hover:bg-slate-800 active:scale-95"
                >
                  {isStreaming ? (
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse" />
                      <div className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse [animation-delay:100ms]" />
                      <div className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse [animation-delay:200ms]" />
                    </div>
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default memo(MessageList);
