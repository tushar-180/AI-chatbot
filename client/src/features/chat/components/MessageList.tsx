import {
  useRef,
  useEffect,
  useCallback,
  memo,
  useState,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  ChevronDown,
  Code,
  Lightbulb,
  PenTool,
  Terminal,
  ShieldAlert,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";
import type { WebSource, Message } from "../types/chat.types";

import MessageItem from "./MessageItem";
import { useChatStore } from "../store/useChatStore";

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
  onRetryMessage?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: "like" | "dislike" | null) => void;
  onCitationClick?: (id: number) => void;
  onSourcesClick?: (sources: WebSource[], activeId?: number) => void;
}

const MessageList = forwardRef<{ instantScrollToBottom: () => void }, MessageListProps>(({
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
  onRetryMessage,
  onFeedback,
  onCitationClick,
  onSourcesClick,
}, ref) => {
  const isTemporaryChatActive = useTemporaryChatStore(
    (state) => state.isTemporaryChatActive,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useImperativeHandle(ref, () => ({
    instantScrollToBottom,
  }));
  const highlight = searchParams.get("highlight");
  const showSuggestions = !currentChatId && messages.length === 0;

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const dbUser = useChatStore((state) => state.dbUser);

  // Track if user manually scrolled up
  const shouldAutoScrollRef = useRef(true);
  const hasInitialScrolledRef = useRef<string | null>(null);

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

  // SCROLL TO BOTTOM (smooth for streaming follow)
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

  // INSTANT JUMP TO BOTTOM — bypasses CSS scroll-behavior: smooth entirely.
  // Use this for initial chat load so the user never sees scrolling animation.
  const instantScrollToBottom = useCallback(() => {
    const container = getScrollContainer();
    if (!container) return;
    shouldAutoScrollRef.current = true;
    container.scrollTop = container.scrollHeight;

  }, [getScrollContainer]);

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
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, [getScrollContainer, handleScroll]);

  // LOCK SCROLL OVERFLOW WHEN SUGGESTIONS ARE ACTIVE
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;

    if (showSuggestions) {
      container.style.overflowY = "hidden";
    } else {
      container.style.overflowY = "auto";
    }

    return () => {
      if (container) {
        container.style.overflowY = "auto";
      }
    };
  }, [showSuggestions, getScrollContainer]);

  // CLEAR HIGHLIGHT ON CLICK OR AFTER 3s
  useEffect(() => {
    if (!highlight) return;

    // Disable auto-scroll while searching
    shouldAutoScrollRef.current = false;

    const clearHighlight = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.has("highlight")) return prev;
          next.delete("highlight");
          return next;
        },
        { replace: true },
      );
    };

    const handleClick = () => clearHighlight();
    const timer = setTimeout(clearHighlight, 3000);

    window.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("click", handleClick, true);
      clearTimeout(timer);
    };
  }, [highlight, setSearchParams]);

  const [hasCompletedInitialScroll, setHasCompletedInitialScroll] =
    useState(false);
  const [prevChatId, setPrevChatId] = useState<string | null>(null);

  if (currentChatId !== prevChatId) {
    setPrevChatId(currentChatId);
    setHasCompletedInitialScroll(false);
    hasInitialScrolledRef.current = null;
    shouldAutoScrollRef.current = true;
  }

  // AUTO SCROLL ON NEW MESSAGES (while streaming or sending)
  useLayoutEffect(() => {
    if (highlight) {
      shouldAutoScrollRef.current = false;
    }

    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    prevChatIdRef.current = currentChatId;

    // Only auto-scroll on new messages when the user hasn't scrolled up
    if (
      !highlight &&
      !messagesLoading &&
      shouldAutoScrollRef.current &&
      messageCountChanged &&
      messages.length > 0
    ) {
      scrollToBottom(false);
    }
  }, [messages, currentChatId, messagesLoading, scrollToBottom, highlight]);

  // INSTANTLY POSITION AT BOTTOM AFTER CHAT FULLY LOADS
  // useLayoutEffect fires before browser paint; direct scrollTop assignment
  // bypasses CSS scroll-behavior: smooth so there is zero visible animation.
  useLayoutEffect(() => {
    if (
      hasLoadedCurrentChat &&
      messages.length > 0 &&
      !messagesLoading &&
      currentChatId
    ) {
      if (hasInitialScrolledRef.current === currentChatId) {
        setHasCompletedInitialScroll(true);
        return;
      }

      if (highlight) {
        hasInitialScrolledRef.current = currentChatId;
        setHasCompletedInitialScroll(true);
        return;
      }

      instantScrollToBottom();
      hasInitialScrolledRef.current = currentChatId;
      setHasCompletedInitialScroll(true);
    } else if (
      hasLoadedCurrentChat &&
      !messagesLoading &&
      messages.length === 0
    ) {
      setHasCompletedInitialScroll(true);
    }
  }, [
    hasLoadedCurrentChat,
    currentChatId,
    messages.length,
    messagesLoading,
    instantScrollToBottom,
    highlight,
  ]);

  const showLoader =
    (messagesLoading ||
      (currentChatId && !hasLoadedCurrentChat) ||
      (currentChatId && !hasCompletedInitialScroll)) &&
    !isNewChat;

  return (
    <div
      ref={scrollContainerRef}
      className={`px-4 py-8 md:px-10 [overflow-anchor:none] ${
        showSuggestions ? "scrollbar-hide" : ""
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {isTemporaryChatActive && messages.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.02] px-5 py-3.5 text-xs text-emerald-400/90 shadow-[0_0_15px_rgba(16,185,129,0.02)] select-none">
            <ShieldAlert
              size={16}
              className="text-emerald-400 animate-pulse shrink-0"
            />
            <span>
              You are in a <strong>Temporary Chat</strong>. All messages and
              assets generated in this session will vanish permanently from
              history and cache once closed.
            </span>
          </div>
        )}

        {showLoader ? (
          <div className="flex w-full animate-in fade-in justify-start duration-300 py-12">
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
        ) : null}

        <div
          style={{
            opacity: showLoader ? 0 : 1,
            pointerEvents: showLoader ? "none" : "auto",
          }}
          className="flex flex-col gap-8 w-full transition-opacity duration-200"
        >
          {showSuggestions ? (
            <div className="flex w-full animate-in fade-in slide-in-from-bottom-4 flex-col items-center justify-center py-12 duration-700 md:py-24">
              <div className="mb-12 flex flex-col items-center text-center">
                <div className="mb-7 flex items-center justify-center">
                  {isTemporaryChatActive ? (
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.15)] animate-pulse">
                      <ShieldAlert size={40} />
                    </div>
                  ) : (
                    <img
                      src="/logo.png"
                      alt="Velora Logo"
                      className="h-20 w-20 object-contain object-center drop-shadow-lg"
                    />
                  )}
                </div>

                <h2 className="mb-3 font-display text-[1.85rem] font-bold tracking-tight text-white md:text-[2rem]">
                  {isTemporaryChatActive
                    ? "Temporary Chat Mode"
                    : `Hello ${dbUser?.firstName || ""}, how can I help you today?`}
                </h2>

                <p className="max-w-md text-base leading-relaxed tracking-[0.01em] text-slate-400">
                  {isTemporaryChatActive
                    ? "This chat is secure and completely stateless. Messages, metadata, and responses exist only in-memory and will be permanently erased once you leave."
                    : isNewChat
                      ? "Your new conversation is ready. Choose a suggestion below or send a message to get started."
                      : "Select an existing chat from the sidebar or start a new one to begin brainstorming or asking questions."}
                </p>
              </div>

              <div className="grid w-full max-w-3xl grid-cols-1 gap-3.5 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSuggestionClick?.(suggestion.prompt)}
                    className={`group flex flex-col items-start rounded-2xl border p-5 text-left transition-all duration-300 ${
                      isTemporaryChatActive
                        ? "border-emerald-500/10 bg-emerald-950/[0.02] hover:border-emerald-500/30 hover:bg-emerald-950/[0.06] hover:shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-indigo-500/[0.03]"
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-3 text-slate-400 transition-colors duration-300 group-hover:text-slate-200">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 transition-all duration-300 ${
                          isTemporaryChatActive
                            ? "group-hover:bg-emerald-500/[0.12] group-hover:shadow-sm group-hover:shadow-emerald-500/20 group-hover:text-emerald-400"
                            : "group-hover:bg-indigo-500/[0.12] group-hover:shadow-sm group-hover:shadow-indigo-500/20 group-hover:text-indigo-400"
                        }`}
                      >
                        <suggestion.icon size={18} strokeWidth={1.8} />
                      </div>

                      <span
                        className={`text-base font-semibold tracking-tight transition-colors duration-300 ${
                          isTemporaryChatActive
                            ? "group-hover:text-emerald-300"
                            : "group-hover:text-slate-200"
                        }`}
                      >
                        {suggestion.title}
                      </span>
                    </div>

                    <p className="pl-12 text-sm leading-relaxed text-slate-500 transition-colors duration-300 group-hover:text-slate-400">
                      {suggestion.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : messagesError && currentChatId && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-base font-semibold tracking-tight text-slate-200">
                Unable to load messages
              </p>
              <p className="mt-2.5 max-w-md text-sm leading-relaxed text-slate-500">
                {messagesError}
              </p>
            </div>
          ) : messages.length === 0 &&
            !loading &&
            !isStreaming &&
            hasLoadedCurrentChat ? (
            <div
              className={`flex flex-col items-center justify-center py-24 text-center `}
            >
              <p className="text-base tracking-wide text-slate-500 hidden">
                No messages yet. The stage is yours.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming && i === messages.length - 1}
                    onEdit={(content) => onEditMessage?.(msg.id, content)}
                    onEditStart={onEditStart}
                    onRetry={() => onRetryMessage?.(msg.id)}
                    onFeedback={(feedback) => onFeedback?.(msg.id, feedback)}
                    highlight={highlight || undefined}
                    onCitationClick={onCitationClick}
                    onSourcesClick={onSourcesClick}
                  />
                );
              })}

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
    </div>
  );
});

MessageList.displayName = "MessageList";

export default memo(MessageList);
