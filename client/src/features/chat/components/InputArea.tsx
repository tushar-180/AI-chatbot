import {
  type SyntheticEvent,
  type KeyboardEvent,
  useRef,
  useEffect,
  memo,
} from "react";
import { Send, Loader2, ChevronDown } from "lucide-react";
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
    <div className="flex items-center px-4 pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-transparent bg-slate-800/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-all hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200"
          >
            {getProviderIcon(selectedProvider)}
            <span>{getModelOnlyName(currentProviderName)}</span>
            <ChevronDown size={10} className="ml-0.5 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 bg-slate-900/95 border-slate-800 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden p-1"
        >
          <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Select Model
          </div>
          {availableProviders.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onProviderChange(p.id)}
              className={`flex items-center gap-2 rounded-xl py-2 px-3 text-xs font-medium cursor-pointer transition-colors ${
                selectedProvider === p.id
                  ? "bg-indigo-500/10 text-indigo-400"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {getProviderIcon(p.id, 14)}
              <span className="capitalize">{getModelOnlyName(p.name)}</span>
              {selectedProvider === p.id && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
              )}
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
        // Trigger the form submit by calling onSubmit with a synthetic event if needed,
        // or just manually triggering a submit on the form ref.
        // For simplicity and consistency with original code:
        const event = {
          preventDefault: () => {},
        } as SyntheticEvent<HTMLFormElement>;
        onSubmit(event);
      }
    }
  };

  return (
    <div className="bg-linear-to-t from-slate-950 via-slate-950/90 to-transparent pb-4 md:pb-8 pt-2 md:pt-4 px-3 md:px-6 relative z-10">
      <form onSubmit={onSubmit} className="mx-auto max-w-4xl relative">
        <div className="group relative flex flex-col gap-0 rounded-4xl md:rounded-4xl border border-slate-800/60 bg-slate-900/60 p-1.5 md:p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-300 focus-within:border-indigo-500/40 focus-within:bg-slate-900/80 focus-within:shadow-[0_20px_50px_rgba(79,70,229,0.1)] focus-within:ring-1 focus-within:ring-indigo-500/20">
          <ModelSelector
            availableProviders={availableProviders}
            selectedProvider={selectedProvider}
            onProviderChange={onProviderChange}
          />

          <div className="flex items-end gap-1.5 md:gap-2 pr-1.5 md:pr-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                currentChatId ? "Ask anything..." : "Start a new journey..."
              }
              className="max-h-[200px] md:max-h-[300px] min-h-[48px] md:min-h-[56px] flex-1 resize-none bg-transparent px-4 md:px-5 py-3 md:py-4 text-[0.95rem] md:text-[1rem] text-slate-100 placeholder-slate-500/80 outline-none overflow-y-auto scrollbar-none selection:bg-indigo-500/30"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={`flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-2xl md:rounded-[1.25rem] mb-1.5 md:mb-2 transition-all duration-300 ${
                loading || !input.trim()
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                  : "bg-linear-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-900/20 hover:scale-105 active:scale-95 hover:shadow-indigo-500/30"
              }`}
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Send
                  size={20}
                  className={
                    input.trim() ? "translate-x-0.5 -translate-y-0.5" : ""
                  }
                />
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 flex justify-center px-4">
          <p className="text-center text-[10px] text-slate-600/80 uppercase tracking-widest font-medium">
            Personalized with <span className="text-slate-400">Code-Bot</span>{" "}
            &bull; Powered by me
          </p>
        </div>
      </form>
    </div>
  );
};

export default memo(InputArea);
