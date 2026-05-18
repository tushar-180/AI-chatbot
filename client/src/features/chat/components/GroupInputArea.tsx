import React, { useState, useRef, useEffect, memo } from "react";
import { ArrowUp, Loader2, Users, Sparkles } from "lucide-react";
import { Gemini, Anthropic, OpenAI, Nvidia } from "@lobehub/icons";
import { api } from "@/lib/api";

interface GroupInputAreaProps {
  onSubmit: (content: string) => Promise<void>;
}

interface Provider {
  id: string;
  name: string;
}

const getProviderIcon = (providerId: string, size = 14) => {
  const p = providerId.split(":")[0].toLowerCase();
  const mapping: Record<string, React.ComponentType<{ size?: number }>> = {
    gemini: Gemini.Color,
    claude: Anthropic,
    openai: OpenAI,
    nvidia: Nvidia.Color,
  };
  const Icon = mapping[p];
  return Icon ? <Icon size={size} /> : null;
};

const getCleanModelName = (id: string) => {
  // e.g. "nvidia:nvidia/nemotron-3-super-120b-a12b" -> "nemotron-3-super-120b-a12b"
  const afterColon = id.includes(":") ? id.split(":")[1] : id;
  return afterColon.includes("/") ? afterColon.split("/").pop() || afterColon : afterColon;
};

const GroupInputArea: React.FC<GroupInputAreaProps> = ({ onSubmit }) => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [filterText, setFilterText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch AI providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await api.get("/ai/providers");
        const rawProviders: Provider[] = res.data.providers || [];

        // Find "gemini:gemini-3.1-flash-lite-preview"
        const defaultModelId = "gemini:gemini-3.1-flash-lite-preview";
        const defaultModel = rawProviders.find(p => p.id === defaultModelId);

        let sortedProviders = [...rawProviders];
        if (defaultModel) {
          // Filter it out and unshift to the very top as default
          sortedProviders = [
            defaultModel,
            ...rawProviders.filter(p => p.id !== defaultModelId)
          ];
        }

        setAvailableProviders(sortedProviders);
      } catch (err) {
        console.error("Error fetching providers", err);
      }
    };
    fetchProviders();
  }, []);

  // Listen to Escape key to dismiss dropdown
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModelDropdown(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Auto-resize logic
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200,
      )}px`;
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSubmit(input);
      setInput("");
      setShowModelDropdown(false);
      setFilterText("");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Detect cursor and split words before cursor to check for active @mention trigger
    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, selectionStart);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith("@")) {
      setShowModelDropdown(true);
      const cleanWord = lastWord.substring(1);
      setFilterText(cleanWord.toLowerCase());
    } else {
      setShowModelDropdown(false);
      setFilterText("");
    }
  };

  const handleSelectModel = (cleanModelName: string) => {
    if (!textareaRef.current) return;

    const selectionStart = textareaRef.current.selectionStart;
    const textBeforeCursor = input.substring(0, selectionStart);
    const textAfterCursor = input.substring(selectionStart);

    const lastAtPos = textBeforeCursor.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const insertText = `@${cleanModelName} `;
      const newInput = input.substring(0, lastAtPos) + insertText + textAfterCursor;
      setInput(newInput);
      setShowModelDropdown(false);
      setFilterText("");

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = lastAtPos + insertText.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    }
  };

  // Filter based on letters typed after '@'
  const filteredProviders = availableProviders.filter((p) => {
    const cleanModelName = getCleanModelName(p.id).toLowerCase();
    const searchString = `${cleanModelName} ${p.name}`.toLowerCase();
    return searchString.includes(filterText);
  });

  return (
    <div className="sticky bottom-0 z-30 pb-8 px-4 md:px-10 pointer-events-none">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-4xl relative pointer-events-auto"
      >
        {/* Model dropdown popover */}
        {showModelDropdown && filteredProviders.length > 0 && (
          <div className="absolute bottom-full left-4 z-50 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200 scrollbar-hide">
            <div className="mb-1.5 flex items-center justify-between border-b border-white/5 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              <span className="flex items-center gap-1.5">
                <Sparkles size={10} className="text-emerald-400" />
                Choose AI Model
              </span>
              <button
                type="button"
                onClick={() => setShowModelDropdown(false)}
                className="text-slate-600 hover:text-white transition-colors text-[10px]"
              >
                ✕
              </button>
            </div>
            <div className="space-y-0.5">
              {filteredProviders.map((p) => {
                const cleanModelName = getCleanModelName(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectModel(cleanModelName)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors group data-[active=true]:bg-white data-[active=true]:text-black text-slate-400 hover:bg-white/5 hover:text-white"
                  >
                    {getProviderIcon(p.id, 12)}
                    <span className="truncate capitalize">
                      @{cleanModelName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="group relative flex flex-col gap-0 rounded-3xl border border-white/10 bg-slate-900/80 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 focus-within:border-white/20 backdrop-blur-2xl">
          {/* Top Label */}
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              <Users size={12} />
              <span>Group Chat</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">
              Type @ to search & mention AI models
            </div>
          </div>

          <div className="flex items-end gap-2 pr-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Message group..."
              className="max-h-50 md:max-h-75 min-h-12 md:min-h-14 flex-1 resize-none bg-transparent px-4 py-3.5 text-[0.95rem] md:text-[1rem] text-slate-100 placeholder-slate-600 outline-none overflow-y-auto scrollbar-hide"
            />

            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className={`flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 transition-all duration-300 ${
                isSending || !input.trim()
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                  : "bg-white text-slate-900 hover:bg-slate-200"
              }`}
            >
              {isSending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default memo(GroupInputArea);
