import {
  type SyntheticEvent,
  type KeyboardEvent,
  useRef,
  useEffect,
  memo,
} from "react";
import { ArrowUp, Loader2, ChevronDown, Square } from "lucide-react";
import { ProviderIcon } from "@lobehub/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAvailableProviders,
  type Provider,
} from "@/features/chat/hooks/useAvailableProviders";

interface InputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void;
  loading: boolean;
  isStreaming: boolean;
  onStop: () => void;
  currentChatId: string | null;
  selectedProvider: string;
  onProviderChange: (value: string) => void;
}

/**
 * Helper to get provider icon
 */
const getProviderIcon = (providerId: string, size = 14) => {
  const p = providerId.split(":")[0].toLowerCase();
  const mapping: Record<string, string> = {
    gemini: "google",
    claude: "anthropic",
    openai: "openai",
    nvidia: "nvidia",
  };
  return <ProviderIcon provider={mapping[p] || p} size={size} type="color" />;
};

/**
 * Helper to clean up model name for display
 */
const getModelOnlyName = (fullName: string) => {
  return fullName.includes(" : ") ? fullName.split(" : ")[1] : fullName;
};

/**
 * Sub-component for selecting AI Model
 */
const ModelSelector = ({
  availableProviders,
  selectedProvider,
  onProviderChange,
}: {
  availableProviders: Provider[];
  selectedProvider: string;
  onProviderChange: (id: string) => void;
}) => {
  const currentProviderName =
    availableProviders.find((p) => p.id === selectedProvider)?.name ||
    selectedProvider;

  return (
    <div className="flex items-center px-4 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white group"
          >
            {getProviderIcon(selectedProvider, 12)}
            <span>{getModelOnlyName(currentProviderName)}</span>
            <ChevronDown size={10} className="ml-0.5 text-slate-600 transition-colors" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-56 bg-slate-900 border-white/10 backdrop-blur-xl rounded-xl shadow-2xl p-1"
        >
          {availableProviders.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onProviderChange(p.id)}
              className={`flex items-center gap-2 rounded-lg py-2 px-3 text-[11px] font-medium cursor-pointer transition-colors ${
                selectedProvider === p.id
                  ? "bg-white text-black"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {getProviderIcon(p.id, 12)}
              <span className="capitalize">{getModelOnlyName(p.name)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * Main InputArea Component
 */
const InputArea = ({
  input,
  onInputChange,
  onSubmit,
  loading,
  isStreaming,
  onStop,
  currentChatId,
  selectedProvider,
  onProviderChange,
}: InputAreaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { availableProviders } = useAvailableProviders(
    selectedProvider,
    onProviderChange,
  );

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) {
        const event = {
          preventDefault: () => {},
        } as SyntheticEvent<HTMLFormElement>;
        onSubmit(event);
      }
    }
  };

  return (
    <div className="pb-8 pt-4 px-4 md:px-10 relative z-10">
      <form onSubmit={onSubmit} className="mx-auto max-w-4xl relative">
        <div className="group relative flex flex-col gap-0 rounded-2xl border border-white/5 bg-white/[0.02] p-1 shadow-2xl transition-all duration-300 focus-within:border-white/10 backdrop-blur-sm">
          <ModelSelector
            availableProviders={availableProviders}
            selectedProvider={selectedProvider}
            onProviderChange={onProviderChange}
          />

          <div className="flex items-end gap-2 pr-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                currentChatId ? "Ask anything..." : "Start a conversation..."
              }
              className="max-h-[200px] md:max-h-[300px] min-h-[48px] md:min-h-[56px] flex-1 resize-none bg-transparent px-4 py-3.5 text-[0.95rem] md:text-[1rem] text-slate-100 placeholder-slate-600 outline-none overflow-y-auto scrollbar-none selection:bg-white/10"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="mb-1.5 md:mb-2 flex h-9 min-w-[76px] shrink-0 items-center justify-center gap-2 rounded-full bg-rose-500 px-3 text-xs font-semibold text-white transition-all duration-300 hover:bg-rose-400 md:h-10"
              >
                <Square size={12} fill="currentColor" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className={`flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 transition-all duration-300 ${
                  loading || !input.trim()
                    ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                    : "bg-white text-slate-900 hover:bg-slate-200"
                }`}
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ArrowUp size={18} strokeWidth={2.5} />
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default memo(InputArea);
