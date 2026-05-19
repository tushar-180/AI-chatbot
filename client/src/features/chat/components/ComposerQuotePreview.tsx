import { X, MessageSquareQuote } from "lucide-react";
import { useComposerStore } from "../store/useComposerStore";

export const ComposerQuotePreview = () => {
  const selectionContext = useComposerStore((state) => state.selectionContext);
  const clearSelectionContext = useComposerStore((state) => state.clearSelectionContext);

  if (!selectionContext) return null;

  return (
    <div className="px-3.5 py-2 border-b border-white/[0.05] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="inline-flex max-w-full items-start gap-2.5 rounded-xl border border-white/10 bg-slate-950/60 p-2 md:p-2.5 shadow-md">
        <MessageSquareQuote size={15} className="text-indigo-400 shrink-0 mt-0.5" />
        
        {/* Scrollable Container for Large Selection */}
        <div className="flex-1 min-w-0 max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent text-sm text-slate-300 leading-relaxed pr-2 select-text">
          <span className="font-bold text-indigo-400/90 text-[10px] tracking-wider uppercase mr-2 select-none align-middle">
            Explain Selection:
          </span>
          <span className="font-medium whitespace-pre-wrap align-middle">
            "{selectionContext.selectedText}"
          </span>
        </div>

        <button
          type="button"
          onClick={clearSelectionContext}
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer flex items-center justify-center h-5 w-5 bg-white/5 border border-white/5 shrink-0"
          title="Remove context"
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};
