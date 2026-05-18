import {
  type SyntheticEvent,
  type KeyboardEvent,
  useRef,
  useEffect,
  memo,
  useState,
} from "react";
import {
  ArrowUp,
  Loader2,
  ChevronDown,
  Square,
  Paperclip,
  X,
  Mic,
  Globe,
} from "lucide-react";

import { Gemini, Anthropic, OpenAI, Nvidia } from "@lobehub/icons";
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
import { supportsVision } from "@/features/chat/constants/chat.constants";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Attachment } from "@/features/chat/hooks/useChatInput";
import { useVoiceInput } from "@/features/chat/hooks/useVoiceInput";

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
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  webSearchEnabled: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
}

/**
 * Helper to get provider icon
 */
const getProviderIcon = (providerId: string, size = 14) => {
  const p = providerId.split(":")[0].toLowerCase();
  const mapping: Record<string, any> = {
    gemini: Gemini.Color,
    claude: Anthropic,
    openai: OpenAI,
    nvidia: Nvidia.Color,
  };
  const Icon = mapping[p];
  return Icon ? <Icon size={size} /> : null;
};

/**
 * Helper to clean up model name for display
 */
const getModelOnlyName = (fullName: string) => {
  return fullName.includes(" : ") ? fullName.split(" : ")[1] : fullName;
};

const WebSearchToggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) => (
  <button
    type="button"
    onClick={() => onToggle(!enabled)}
    aria-pressed={enabled}
    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${
      enabled
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:border-emerald-300/40 hover:bg-emerald-400/15"
        : "border-white/10 bg-white/5 text-slate-500 hover:border-white/20 hover:bg-white/10 hover:text-white"
    }`}
  >
    <Globe size={12} />
    <span>Web</span>
  </button>
);

/**
 * Sub-component for selecting AI Model
 */
const ModelSelector = ({
  availableProviders,
  selectedProvider,
  onProviderChange,
  webSearchEnabled,
  onWebSearchToggle,
}: {
  availableProviders: Provider[];
  selectedProvider: string;
  onProviderChange: (id: string) => void;
  webSearchEnabled: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
}) => {
  const currentProviderName =
    availableProviders.find((p) => p.id === selectedProvider)?.name ||
    selectedProvider;

  return (
    <div className="flex items-center gap-2 px-4 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            {getProviderIcon(selectedProvider, 12)}
            <span>{getModelOnlyName(currentProviderName)}</span>
            <ChevronDown
              size={10}
              className="ml-0.5 text-slate-600 transition-colors"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-56 rounded-xl border-white/10 bg-slate-900 p-1 shadow-2xl backdrop-blur-xl"
        >
          {availableProviders.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onProviderChange(p.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors ${
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
      <WebSearchToggle
        enabled={webSearchEnabled}
        onToggle={onWebSearchToggle}
      />
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
  attachments = [],
  onAttachmentsChange,
  webSearchEnabled,
  onWebSearchToggle,
}: InputAreaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);

  const { isListening, isSpeaking, start, stop } = useVoiceInput({
    onResult: (text) => {
      console.log("✍️ Injecting voice text into input:", text);
      onInputChange(text);
    },
  });

  const { availableProviders } = useAvailableProviders(
    selectedProvider,
    onProviderChange,
  );

  const canUpload = supportsVision(selectedProvider);

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
      if (
        (input.trim() || attachments.length > 0) &&
        !loading &&
        !isUploading
      ) {
        const event = {
          preventDefault: () => {},
        } as SyntheticEvent<HTMLFormElement>;
        onSubmit(event);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith("image/")) {
      toast.error("Only image uploads are supported currently");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await api.post("/upload/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const newAttachment: Attachment = {
        url: res.data.url,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      };

      onAttachmentsChange?.([...attachments, newAttachment]);
      toast.success("Image uploaded");
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    const next = [...attachments];
    next.splice(index, 1);
    onAttachmentsChange?.(next);
  };

  return (
    <div className="sticky bottom-0 z-30 pb-8 px-4 md:px-10 pointer-events-none">
      <form
        onSubmit={onSubmit}
        className="mx-auto max-w-4xl relative pointer-events-auto"
      >
        <div className="group relative flex flex-col gap-0 rounded-3xl border border-white/10 bg-slate-900/80 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 focus-within:border-white/20 backdrop-blur-2xl">
          <ModelSelector
            availableProviders={availableProviders}
            selectedProvider={selectedProvider}
            onProviderChange={onProviderChange}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={onWebSearchToggle}
          />

          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2">
              {attachments.map((att, i) => (
                <div
                  key={att.url}
                  className="group/att relative h-16 w-16 rounded-lg overflow-hidden border border-white/10 bg-white/5"
                >
                  <img
                    src={att.url}
                    alt={att.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 pr-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*"
            />

            {canUpload && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 text-slate-500 hover:text-white hover:bg-white/5 transition-all duration-300 disabled:opacity-50"
                aria-label="Upload image"
              >
                {isUploading ? (
                  <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                  <Paperclip size={18} />
                )}
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                currentChatId ? "Ask anything..." : "Start a conversation..."
              }
              className={`max-h-50 md:max-h-75 min-h-12 md:min-h-14 flex-1 resize-none bg-transparent ${canUpload ? "px-1" : "px-4"} py-3.5 text-[0.95rem] md:text-[1rem] text-slate-100 placeholder-slate-600 outline-none overflow-y-auto scrollbar-hide`}
            />
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  stop();
                } else {
                  start();
                }
              }}
              className={`relative mb-1.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-300 md:mb-2 md:h-10 md:w-10 ${
                isListening
                  ? "bg-rose-500/20 text-rose-400"
                  : "text-slate-500 hover:bg-white/5 hover:text-white"
              }`}
              aria-label="Voice input"
            >
              {isListening && !isSpeaking && (
                <span className="absolute inset-0 animate-pulse rounded-full border border-rose-400/40" />
              )}

              {isSpeaking && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />
                  <span className="absolute inset-1 animate-pulse rounded-full border border-rose-300" />
                </>
              )}

              <span className="relative z-10 flex items-center justify-center">
                {isListening ? (
                  <Square size={14} fill="currentColor" />
                ) : (
                  <Mic size={18} />
                )}
              </span>
            </button>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 bg-white text-slate-900 hover:bg-rose-50 transition-all duration-300 group"
                aria-label="Stop generation"
              >
                <Square
                  size={14}
                  fill="currentColor"
                  className="transition-colors group-hover:text-rose-600"
                />
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  loading ||
                  isUploading ||
                  (!input.trim() && attachments.length === 0)
                }
                className={`flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 transition-all duration-300 ${
                  loading ||
                  isUploading ||
                  (!input.trim() && attachments.length === 0)
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
