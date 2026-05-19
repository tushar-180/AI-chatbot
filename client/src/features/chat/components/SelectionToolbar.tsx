import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useSelectionStore } from "../store/useSelectionStore";
import { useComposerStore } from "../store/useComposerStore";

export const SelectionToolbar = () => {
  const selection = useSelectionStore((state) => state.selection);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const setSelectionContext = useComposerStore((state) => state.setSelectionContext);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (selection) {
      // Small timeout to allow positioning & styling animations to resolve smoothly
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [selection]);

  if (!selection) return null;

  const handleAskToVelora = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. Store in composer context
    setSelectionContext({
      selectedText: selection.selectedText,
      originalSourceMessage: selection.originalSourceMessage,
      sourceMessageId: selection.sourceMessageId,
      actionType: selection.actionType,
    });

    // 2. Dispatch a custom event to focus and clear the composer text
    const event = new CustomEvent("insert-quote", {
      detail: {
        text: "",
      },
    });
    window.dispatchEvent(event);

    // 3. Clear selection state & window ranges
    clearSelection();
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      id="selection-toolbar"
      ref={toolbarRef}
      style={{
        position: "fixed",
        top: `${selection.position.top}px`,
        left: `${selection.position.left}px`,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
      className={`flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 px-3.5 py-2 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out pointer-events-auto ${
        isVisible
          ? "opacity-100 scale-100 translate-y-0"
          : "opacity-0 scale-95 translate-y-1"
      }`}
      onMouseDown={(e) => e.preventDefault()} // Keep focus inside the composer
    >
      <button
        onClick={handleAskToVelora}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-all uppercase tracking-wider cursor-pointer"
      >
        <Sparkles size={13} className="text-indigo-400 fill-indigo-400/20 animate-pulse" />
        <span>Ask to Velora</span>
      </button>
    </div>
  );
};
