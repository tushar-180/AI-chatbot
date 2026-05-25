import { useCallback, useState, useEffect, useRef } from "react";
import { Search, X, MessageSquare, Clock } from "lucide-react";
import { useChatList } from "../hooks/useChatList";
import type { Chat } from "../types/chat.types";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchResult = Chat & {
  snippet?: string;
};

const SearchModal = ({ isOpen, onClose }: SearchModalProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { searchChats, selectChat } = useChatList();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchChatsRef = useRef(searchChats);

  const handleClose = useCallback(() => {
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setLoading(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    searchChatsRef.current = searchChats;
  }, [searchChats]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (query.trim()) {
        setLoading(true);
        const res = await searchChatsRef.current(query);
        if (cancelled) return;
        setResults(res);
        setActiveIndex(res.length > 0 ? 0 : -1);
        setLoading(false);
      } else {
        setResults([]);
        setActiveIndex(-1);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Smooth scroll to highlighted result
  useEffect(() => {
    if (activeIndex >= 0) {
      const activeEl = document.querySelector(`[data-search-index="${activeIndex}"]`);
      activeEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleClose(); // Toggle logic should be in parent
      }
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }

      if (!isOpen || results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < results.length) {
          e.preventDefault();
          const selected = results[activeIndex];
          selectChat(selected._id, query);
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, isOpen, results, activeIndex, selectChat, query]);

  if (!isOpen) return null;

  const highlightMatch = (text: string, term: string) => {
    if (!term.trim()) return text;
    const parts = text.split(new RegExp(`(${term})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === term.toLowerCase() ? (
            <span key={i} className="text-emerald-400 font-bold bg-emerald-400/10 px-0.5 rounded">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={handleClose}
      />
      
      <div className="relative w-full max-w-2xl bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200 backdrop-blur-xl">
        <div className="relative flex items-center border-b border-white/5 px-6 py-4">
          <Search size={20} className="text-slate-500 mr-4" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, messages, and more..."
            className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder:text-slate-600"
          />
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Searching...</p>
            </div>
          ) : query && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <p className="text-slate-400 font-medium mb-1">No results found for "{query}"</p>
              <p className="text-sm text-slate-600">Try searching for something else</p>
            </div>
          ) : results.length > 0 ? (
            <div className="p-3">
              {results.map((result, index) => (
                <button
                  key={result._id}
                  data-search-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    selectChat(result._id, query);
                    handleClose();
                  }}
                  className={`w-full flex items-start gap-4 p-4 rounded-2xl transition-all group text-left mb-1 last:mb-0 border ${
                    activeIndex === index
                      ? "bg-white/5 border-emerald-500/25 text-emerald-400"
                      : "border-transparent hover:bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${activeIndex === index ? "bg-emerald-500/10" : "bg-slate-800 group-hover:bg-emerald-500/10"}`}>
                    <MessageSquare size={18} className={`transition-colors ${activeIndex === index ? "text-emerald-400" : "text-slate-400 group-hover:text-emerald-400"}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <h4 className={`font-semibold truncate transition-colors ${activeIndex === index ? "text-emerald-400" : "text-white group-hover:text-emerald-400"}`}>
                        {highlightMatch(result.title || "Untitled Session", query)}
                      </h4>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 shrink-0">
                        {result.updatedAt
                          ? new Date(result.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                          : ""}
                      </span>
                    </div>
                    
                    {result.snippet && (
                      <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                        {highlightMatch(result.snippet, query)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="flex items-center justify-center gap-2 text-slate-600 text-sm mb-4">
                <Clock size={14} />
                <span>Recent Searches</span>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {["AI Development", "Next.js", "React Hooks", "Database Design"].map(tag => (
                  <button 
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 text-xs font-bold hover:bg-white/10 hover:text-white transition-all"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/5 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-sans">Enter</kbd>
              <span>to select</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-sans">Esc</kbd>
              <span>to close</span>
            </div>
          </div>
          
          <div className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-[0.2em]">
            Velora Search
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
