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
  Archive,
  Image as ImageIcon,
  FileText,
  Table,
  MonitorPlay,
  File as FileIcon,
} from "lucide-react";

import { Gemini, Anthropic, OpenAI, Nvidia } from "@lobehub/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAvailableProviders,
  type Provider,
} from "@/features/chat/hooks/useAvailableProviders";
import { supportsVision } from "@/features/chat/constants/chat.constants";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Attachment } from "@/features/chat/hooks/useChatInput";
import { useVoiceInput } from "@/features/chat/hooks/useVoiceInput";
import { ComposerQuotePreview } from "./ComposerQuotePreview";
import { useComposerStore } from "@/features/chat/store/useComposerStore";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";

export interface InputAreaProps {
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
  quotaStatus?: {
    allowed: boolean;
    scope: "ok" | "global" | "user" | "cooldown" | "monthly";
    reason?:
      | "global_quota_exceeded"
      | "user_quota_exceeded"
      | "cooldown_active"
      | "monthly_credits_exhausted";
    message?: string;
    retryAfterMs?: number;
  } | null;
  isQuotaLoading?: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
  isArchived?: boolean;
  onUnarchive?: () => void;
  onSubmitDocument?: (file: File) => void;
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
  disabled,
  reason,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  reason?: string;
}) => {
  const button = (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        onToggle(!enabled);
      }}
      aria-pressed={enabled}
      className={`
                flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all
                ${
                  enabled
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-400/20 hover:text-emerald-200"
                    : "border-white/10 bg-white/5 text-slate-500 hover:border-white/20 hover:bg-white/10 hover:text-white"
                }
                ${disabled ? "opacity-40 cursor-not-allowed" : ""}
            `}
    >
      {disabled && reason === "Loading..." ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Globe size={12} />
      )}
      <span>Web Search</span>
    </button>
  );

  if (disabled && reason && reason !== "Loading...") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

const ModelSelector = ({
  availableProviders,
  selectedProvider,
  onProviderChange,
  webSearchEnabled,
  onWebSearchToggle,
  quotaStatus,
  isQuotaLoading,
}: {
  availableProviders: Provider[];
  selectedProvider: string;
  onProviderChange: (id: string) => void;
  webSearchEnabled: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
  quotaStatus?: InputAreaProps["quotaStatus"];
  isQuotaLoading?: boolean;
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
        disabled={isQuotaLoading || quotaStatus?.allowed === false}
        reason={
          isQuotaLoading
            ? "Loading..."
            : quotaStatus?.allowed === false
              ? quotaStatus.scope === "global"
                ? "Global daily limit reached"
                : quotaStatus.scope === "user"
                  ? "Daily user limit reached"
                  : quotaStatus.scope === "monthly" ||
                      quotaStatus.reason === "monthly_credits_exhausted"
                    ? "Monthly credits exhausted"
                    : "Cooldown active"
              : undefined
        }
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
  isArchived = false,
  onUnarchive,
  quotaStatus,
  isQuotaLoading,
  onSubmitDocument
}: InputAreaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const isTemporaryChatActive = useTemporaryChatStore(
    (state) => state.isTemporaryChatActive,
  );
  const [isUploading, setIsUploading] = useState(false);
  const selectionContext = useComposerStore((state) => state.selectionContext);

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

  // Quote insertion listener with focus and cursor placement
  useEffect(() => {
    const handleInsertQuote = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      const textToInsert = customEvent.detail.text;
      onInputChange(textToInsert);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.value.length;
          textareaRef.current.selectionEnd = textareaRef.current.value.length;
        }
      }, 50);
    };

    window.addEventListener("insert-quote", handleInsertQuote);
    return () => {
      window.removeEventListener("insert-quote", handleInsertQuote);
    };
  }, [onInputChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (
        (input.trim() || attachments.length > 0) &&
        !loading &&
        !isUploading
      ) {
          handleFormSubmit(e as any);

      }
    }
  };

  const ALLOWED_FILE_TYPES = [
    "application/pdf",

    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isDocument = ALLOWED_FILE_TYPES.includes(file.type);

    if (isDocument) {
      setDocumentFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Basic validation
    if (!isImage && !isDocument) {
      toast.error("Unsupported file type!");
      return;
    }

    const MAX_SIZE = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    const maxMB = MAX_SIZE / (1024 * 1024);

    if (file.size > MAX_SIZE) {
      toast.error(`Image size must be less than ${maxMB}MB`);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

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

  const getAttachmentIcon = (mimeType?: string) => {
    if (!mimeType) return FileIcon;

    const WORD = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    const EXCEL = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const PPT = [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }

    if (WORD.includes(mimeType)) return FileText;
    if (EXCEL.includes(mimeType)) return Table;
    if (PPT.includes(mimeType)) return MonitorPlay;

    if (mimeType.includes("pdf")) {
      return FileText;
    }

    if (mimeType.includes("sheet")) {
      return Table;
    }

    if (mimeType.includes("presentation")) {
      return MonitorPlay;
    }

    return FileIcon;
  };

  const removeAttachment = (index: number) => {
    const next = [...attachments];
    next.splice(index, 1);
    onAttachmentsChange?.(next);
  };

  const handleFormSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (loading || isUploading) return;

  if (documentFile && onSubmitDocument) {
    onSubmitDocument(documentFile);
    setDocumentFile(null);
    return;
  }

  // Normal submission (no document)
  onSubmit(e);
};

  return (
    <div className="sticky bottom-0 z-30 pb-8 px-4 md:px-10 pointer-events-none">
      {isArchived ? (
        <div className="mx-auto max-w-4xl pointer-events-auto px-4 md:px-0">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/80 p-3 md:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 backdrop-blur-2xl">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                <Archive size={20} />
              </div>
              <div className="text-left">
                <h4 className="text-[11px] font-bold text-white uppercase tracking-[0.15em] mb-0.5">
                  Archived Session
                </h4>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">
                  This conversation is preserved in the vault.
                </p>
              </div>
            </div>
            <button
              onClick={onUnarchive}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-white text-black px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-xl shadow-white/5"
            >
              <ArrowUp size={14} className="rotate-180" />
              <span>Restore to continue</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <form
            onSubmit={onSubmit}
            className="mx-auto max-w-4xl relative pointer-events-auto"
          >
            <div className="group relative flex flex-col gap-0 rounded-3xl border border-white/10 bg-slate-900/80 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 focus-within:border-white/20 backdrop-blur-2xl">
              <ComposerQuotePreview />

              <ModelSelector
                availableProviders={availableProviders}
                selectedProvider={selectedProvider}
                onProviderChange={onProviderChange}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={onWebSearchToggle}
                quotaStatus={quotaStatus}
                isQuotaLoading={isQuotaLoading}
              />

              {/* Attachment Previews */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 py-2">
                  {attachments.map((att, i) => {
                    const isImage = att.mimeType?.startsWith("image/");
                    const Icon = getAttachmentIcon(att.mimeType);

                    return (
                      <div
                        key={`${att.url}-${i}`}
                        className="group/att relative h-16 w-16 rounded-lg overflow-hidden border border-white/10 bg-white/5"
                      >
                        {isImage ? (
                          <img
                            src={att.url}
                            alt={att.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center p-1 text-center">
                            <Icon
                              size={20}
                              className="text-slate-300 shrink-0"
                            />

                            <span className="mt-1 line-clamp-2 text-[9px] text-slate-400">
                              {att.name}
                            </span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {documentFile && (
                <div className="flex flex-wrap gap-2 px-4 py-2">
                  <div className="group/att relative h-16 w-16 rounded-lg overflow-hidden border border-white/10 bg-white/5 flex flex-col items-center justify-center">
                    <FileText size={20} className="text-slate-300 shrink-0" />
                    <span className="mt-1 line-clamp-2 text-[9px] text-slate-400 text-center">
                      {documentFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocumentFile(null)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2 pr-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
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
                    isTemporaryChatActive
                      ? "Message Temporary Chat..."
                      : currentChatId
                        ? "Ask anything..."
                        : "Start a conversation..."
                  }
                  className={`max-h-50 md:max-h-75 min-h-12 md:min-h-14 flex-1 resize-none bg-transparent ${canUpload ? "px-1" : "px-4"} py-3.5 text-[0.95rem] md:text-[1rem] text-slate-100 placeholder-slate-600 outline-none overflow-y-auto`}
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
                      (!input.trim() &&
                        attachments.length === 0 &&
                        !selectionContext && !documentFile)
                    }
                    className={`flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 transition-all duration-300 ${
                      loading ||
                      isUploading ||
                      (!input.trim() &&
                        attachments.length === 0 &&
                        !selectionContext)
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
        </>
      )}
    </div>
  );
};

export default memo(InputArea);
