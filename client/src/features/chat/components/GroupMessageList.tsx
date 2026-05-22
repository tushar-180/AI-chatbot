import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import GroupMessageItem from "./GroupMessageItem";
import { useGroupStore } from "../store/useGroupStore";
import { Globe, ChevronDown } from "lucide-react";
import { useParams } from "react-router-dom";

interface GroupMessageListProps {
  onCitationClick?: (id: number) => void;
  onSourcesClick?: (sources: any[], activeId?: number) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onEditStart?: () => void;
  onRetryMessage?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: "like" | "dislike" | null) => void;
}

const GroupMessageList = ({
  onCitationClick,
  onSourcesClick,
  onEditMessage,
  onEditStart,
  onRetryMessage,
  onFeedback,
}: GroupMessageListProps) => {
  const {
    groupMessages: storeMessages,
    loading: storeLoading,
    currentGroupId,
    isAiThinking: storeAiThinking,
    isWebSearching: storeWebSearching,
  } = useGroupStore();
  const { groupId } = useParams<{ groupId: string }>();

  const isTransitioning = groupId !== currentGroupId;
  const loading = storeLoading || isTransitioning;
  const groupMessages = isTransitioning ? [] : storeMessages;
  const isAiThinking = isTransitioning ? false : storeAiThinking;
  const isWebSearching = isTransitioning ? false : storeWebSearching;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const shouldAutoScrollRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const prevGroupIdRef = useRef<string | null>(null);

  const getScrollContainer = useCallback(() => {
    return scrollContainerRef.current?.closest(
      ".overflow-y-auto",
    ) as HTMLDivElement | null;
  }, []);

  const isAtBottom = useCallback(() => {
    const container = getScrollContainer();
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      120
    );
  }, [getScrollContainer]);

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

  // INSTANT JUMP — direct scrollTop assignment bypasses CSS scroll-behavior: smooth.
  const instantScrollToBottom = useCallback(() => {
    const container = getScrollContainer();
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [getScrollContainer]);

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

  const [hasCompletedInitialScroll, setHasCompletedInitialScroll] = useState(false);
  const [prevGroupIdState, setPrevGroupIdState] = useState<string | null>(null);

  if ((groupId || null) !== prevGroupIdState) {
    setPrevGroupIdState(groupId || null);
    setHasCompletedInitialScroll(false);
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
  }

  // AUTO SCROLL ON NEW MESSAGES / AI THINKING
  useLayoutEffect(() => {
    const messageCountChanged =
      groupMessages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = groupMessages.length;

    if (
      shouldAutoScrollRef.current &&
      (messageCountChanged || isAiThinking) &&
      groupMessages.length > 0
    ) {
      scrollToBottom(false);
    }
  }, [groupMessages.length, isAiThinking, scrollToBottom]);

  useLayoutEffect(() => {
    if (groupMessages.length > 0 && !loading) {
      instantScrollToBottom();
      setHasCompletedInitialScroll(true);
    } else if (groupMessages.length === 0 && !loading) {
      setHasCompletedInitialScroll(true);
    }
  }, [groupId, groupMessages.length, loading, instantScrollToBottom]);

  const isStreaming = groupMessages.some((msg) => msg.status === "streaming");
  const showLoader = loading || !hasCompletedInitialScroll;

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-full px-4 py-8 md:px-10 [overflow-anchor:none]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
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
          {groupMessages.length === 0 && !isAiThinking && !loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-base tracking-wide text-slate-500">
                No messages yet. The stage is yours.
              </p>
            </div>
          ) : (
            <>
              {groupMessages.map((msg) => (
                <GroupMessageItem
                  key={msg._id}
                  message={msg}
                  onCitationClick={onCitationClick}
                  onSourcesClick={onSourcesClick}
                  onEdit={(content) => onEditMessage?.(msg._id, content)}
                  onEditStart={onEditStart}
                  onRetry={() => onRetryMessage?.(msg._id)}
                  onFeedback={(feedback) => onFeedback?.(msg._id, feedback)}
                />
              ))}
              {isAiThinking && (
                <div
                  key="group-active-thinking-loader"
                  className="flex w-full justify-start duration-300 animate-in fade-in slide-in-from-bottom-2"
                >
                  <div className="flex max-w-[85%] flex-row gap-3 items-start">
                    <div className="flex shrink-0 items-center justify-center rounded-lg overflow-hidden h-7 w-7 bg-slate-900 border border-white/[0.05]">
                      <img
                        src="/logo.png"
                        alt="Velora Logo"
                        className="h-full w-full object-contain"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Velora
                      </span>
                      <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] px-5 py-3.5 shadow-sm">
                        {isWebSearching ? (
                          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-400">
                            <Globe size={14} className="animate-pulse" />
                            <span>Searching the web...</span>
                          </div>
                        ) : (
                          <>
                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
                            <span className="ml-1 text-xs font-medium tracking-wide text-slate-400 animate-pulse">
                              generating response
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SCROLL TO BOTTOM BUTTON */}
              {showScrollToBottom && groupMessages.length > 0 && (
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
};

export default GroupMessageList;
