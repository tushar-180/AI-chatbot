import { useCallback, useState, useEffect, useRef } from "react";
import { Search, X, MessageSquare, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
          if (selected.chatType === 'group') {
            navigate(`/group/${selected._id}?highlight=${encodeURIComponent(query)}`);
          } else {
            selectChat(selected._id, query);
          }
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
            <span key={i} className="font-bold underline bg-zinc-100 dark:bg-white/10 px-0.5 rounded text-zinc-900 dark:text-white">
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
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200 backdrop-blur-xl text-zinc-900 dark:text-white">
        <div className="relative flex items-center border-b border-zinc-100 dark:border-zinc-900 px-6 py-4">
          <Search size={20} className="text-zinc-400 dark:text-zinc-500 mr-4" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, messages, and more..."
            className="flex-1 bg-transparent border-none outline-none text-zinc-900 dark:text-white text-lg placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-white" />
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-450 dark:text-zinc-500">Searching...</p>
            </div>
          ) : query && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <p className="text-zinc-500 dark:text-zinc-400 font-medium mb-1">No results found for "{query}"</p>
              <p className="text-sm text-zinc-400 dark:text-zinc-650">Try searching for something else</p>
            </div>
          ) : results.length > 0 ? (
            <div className="p-3">
              <div className="px-3 pb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Found {results.length} {results.length === 1 ? "result" : "results"}
              </div>
              {results.map((result, index) => (
                <button
                  key={result._id}
                  data-search-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    if (result.chatType === 'group') {
                      navigate(`/group/${result._id}?highlight=${encodeURIComponent(query)}`);
                    } else {
                      selectChat(result._id, query);
                    }
                    handleClose();
                  }}
                  className={`w-full flex items-start gap-4 p-4 rounded-2xl transition-all group text-left mb-1 last:mb-0 border cursor-pointer ${
                    activeIndex === index
                      ? "bg-zinc-50 dark:bg-white/5 border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white"
                      : "border-transparent hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${activeIndex === index ? "bg-zinc-200 dark:bg-white/10" : "bg-zinc-100 dark:bg-zinc-900 group-hover:bg-zinc-200 dark:group-hover:bg-white/10"}`}>
                    <MessageSquare size={18} className={`transition-colors ${activeIndex === index ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white"}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <h4 className={`font-semibold truncate transition-colors ${activeIndex === index ? "text-zinc-900 dark:text-white" : "text-zinc-900 dark:text-white group-hover:text-zinc-900 dark:group-hover:text-white"}`}>
                          {highlightMatch(result.title || "Untitled Session", query)}
                        </h4>
                        {result.chatType === 'group' && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400 uppercase">
                            GROUP
                          </span>
                        )}
                        {result.chatType === 'project' && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 uppercase">
                            Project
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-650 shrink-0">
                        {result.updatedAt
                          ? new Date(result.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                          : ""}
                      </span>
                    </div>
                    
                    {result.snippet && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-450 line-clamp-2 leading-relaxed">
                        {highlightMatch(result.snippet, query)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="flex items-center justify-center gap-2 text-zinc-450 dark:text-zinc-600 text-sm mb-4">
                <Clock size={14} />
                <span>Recent Searches</span>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {["AI Development", "Next.js", "React Hooks", "Database Design"].map(tag => (
                  <button 
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-4 py-2 rounded-xl bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 text-zinc-500 dark:text-zinc-400 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-450 dark:text-zinc-600 uppercase tracking-widest">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 font-sans">Enter</kbd>
              <span>to select</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-450 dark:text-zinc-600 uppercase tracking-widest">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 font-sans">Esc</kbd>
              <span>to close</span>
            </div>
          </div>
          
          <div className="text-[10px] font-bold text-zinc-900 dark:text-white/60 uppercase tracking-[0.2em]">
            Velora Search
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
