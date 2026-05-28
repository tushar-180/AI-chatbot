/**
 * GenerationSwitcher
 *
 * Renders the "◀ 1 / 3 ▶" navigation control that appears below assistant
 * messages that have multiple generations (retries), or above/within user
 * messages that have been edited.
 *
 * Matches ChatGPT's UX: previous/next arrows with a "current / total" counter.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStore } from "../store/useChatStore";
import type { Message } from "../types/chat.types";

interface GenerationSwitcherProps {
  /** The currently visible message. */
  message: Message;
  /** All sibling messages in the same branchId group, sorted by version. */
  siblings: Message[];
  /** chatId needed for the API call. */
  chatId: string;
  /** Called after switching so the parent can refresh messages. */
  onSwitch?: (newMessage: Message) => void;
}

export function GenerationSwitcher({
  message,
  siblings,
  chatId,
  onSwitch,
}: GenerationSwitcherProps) {
  const setGenerationIndex = useChatStore((s) => s.setGenerationIndex);

  if (siblings.length <= 1) return null;

  const getMsgId = (m: Message) => String(m.id || (m as any)._id || (m as any).requestId || "");
  const currentId = getMsgId(message);
  const currentIndex = siblings.findIndex((s) => getMsgId(s) === currentId);
  const total = siblings.length;
  const position = currentIndex === -1 ? total : currentIndex + 1;

  const navigate = async (delta: -1 | 1) => {
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    const target = siblings[nextIndex];
    const targetId = getMsgId(target);

    // Optimistically call onSwitch immediately for snappy UX
    onSwitch?.(target);

    // Update local store
    if (target.branchId && targetId) {
      setGenerationIndex(chatId, target.branchId, targetId);
    }

    // Persist server-side in background (non-blocking)
    if (target.branchId && targetId) {
      api.post("/chat/branch/active", {
        chatId,
        branchId: target.branchId,
        messageId: targetId,
      }).catch((err) => console.error("Failed to persist generation switch", err));
    }
  };

  return (
    <div className="flex items-center gap-0.5 select-none">
      <button
        onClick={() => navigate(-1)}
        disabled={position <= 1}
        aria-label="Previous generation"
        className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-slate-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={13} strokeWidth={2.5} />
      </button>

      <span className="text-[11px] font-medium text-slate-500 tabular-nums px-0.5 min-w-[2rem] text-center">
        {position}&thinsp;/&thinsp;{total}
      </span>

      <button
        onClick={() => navigate(1)}
        disabled={position >= total}
        aria-label="Next generation"
        className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-slate-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}
