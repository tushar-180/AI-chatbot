import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import GroupMessageItem from "./GroupMessageItem";
import { useGroupStore } from "../store/useGroupStore";

const GroupMessageList = () => {
  const { groupMessages, loading } = useGroupStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const getScrollContainer = useCallback(() => {
    return scrollContainerRef.current?.closest(
      ".overflow-y-auto",
    ) as HTMLDivElement | null;
  }, []);

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

  useEffect(() => {
    if (groupMessages.length > 0) {
      scrollToBottom(true);
    }
  }, [groupMessages, scrollToBottom]);

  useLayoutEffect(() => {
    const messageCountChanged =
      groupMessages.length !== prevMessageCountRef.current;

    if (!loading || messageCountChanged) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }

    prevMessageCountRef.current = groupMessages.length;
  }, [groupMessages.length, loading, scrollToBottom]);

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-full px-4 py-8 md:px-10 [overflow-anchor:none]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {loading && groupMessages.length === 0 ? (
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
        ) : groupMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-base tracking-wide text-slate-500">
              No messages yet. The stage is yours.
            </p>
          </div>
        ) : (
          <>
            {groupMessages.map((msg) => (
              <GroupMessageItem key={msg._id} message={msg} />
            ))}
            <div ref={scrollAnchorRef} className="h-4 w-full" />
          </>
        )}
      </div>
    </div>
  );
};

export default GroupMessageList;
