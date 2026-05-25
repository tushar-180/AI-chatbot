import { memo, useRef, useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WebSource } from "@/features/chat/types/chat.types";

interface SourcesSidebarProps {
  sources: WebSource[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}

const SourcesSidebar = memo(({ sources, activeId, onSelect, onClose }: SourcesSidebarProps) => {
  const sourceRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll active source into view
  useEffect(() => {
    if (activeId !== null) {
      const el = sourceRefs.current.get(activeId);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeId]);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex flex-col w-full sm:w-80 xl:w-96 border-l border-white/10 bg-slate-950/80 backdrop-blur-xl overflow-y-auto lg:relative lg:translate-x-0">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/90">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200">
          Sources
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-400 hover:text-white"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>

      <div className="flex-1 px-3 py-4 space-y-4">
        {sources.map((source) => (
          <div
            key={source.id}
            ref={(el) => {
              if (el) sourceRefs.current.set(source.id, el);
            }}
            onClick={() => onSelect(source.id)}
            className={`group cursor-pointer transition-all duration-200 rounded-xl p-3 ${
              activeId === source.id
                ? "bg-indigo-500/10 ring-1 ring-indigo-500/30"
                : "hover:bg-white/5"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Favicon */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${source.hostname}&sz=32`}
                alt=""
                className="w-5 h-5 mt-0.5 rounded flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/favicon.png"; // fallback
                }}
              />
              <div className="min-w-0 flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-indigo-400 hover:text-indigo-300 truncate block"
                  onClick={(e) => e.stopPropagation()}
                >
                  {source.title}
                </a>
                <p className="mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2">
                  {source.snippet}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 truncate">
                    {source.hostname}
                  </span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
        {sources.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">
            No sources available
          </p>
        )}
      </div>
    </aside>
  );
});

export default SourcesSidebar;
