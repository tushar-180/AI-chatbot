import React, { useState, useRef, useEffect, memo } from "react";
import { ArrowUp, Loader2, Users, Sparkles, Globe, Square, Mic, Paperclip, X } from "lucide-react";
import { Gemini, Anthropic, OpenAI, Nvidia } from "@lobehub/icons";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useVoiceInput } from "@/features/chat/hooks/useVoiceInput";
import type { Attachment } from "@/features/chat/hooks/useChatInput";
import { supportsVision } from "@/features/chat/constants/chat.constants";

interface GroupInputAreaProps {
  onSubmit: (content: string, webSearchEnabled?: boolean, attachments?: Attachment[]) => Promise<void>;
  isStreaming?: boolean;
  onStop?: () => void;
  onTyping?: (isTyping: boolean) => void;
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

const WebSearchToggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) => {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={`flex items-center gap-2 rounded-lg border transition-all px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
        enabled
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-400/20 hover:text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.15)]"
          : "border-white/10 bg-white/5 text-slate-500 hover:border-white/20 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Globe size={12} className="shrink-0" />
      <span>Web Search</span>
    </button>
  );
};

const GroupInputArea: React.FC<GroupInputAreaProps> = ({ onSubmit, isStreaming = false, onStop, onTyping }) => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCurrentlyTyping, setIsCurrentlyTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const sharedTextStyles: React.CSSProperties = {
    lineHeight: "1.5rem",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    letterSpacing: "inherit",
    boxSizing: "border-box",
    margin: 0,
  };

  const { isListening, isSpeaking, start, stop } = useVoiceInput({
    onResult: (text) => {
      console.log("✍️ Injecting voice text into group input:", text);
      setInput(text);
    },
  });

  const hasAiMention = (text: string): boolean => {
    const mentions: string[] = text.match(/@([a-zA-Z0-9-:_/.]+)/g) || [];
    return mentions.some((m) => {
      const mentionText = m.substring(1).toLowerCase();
      return (
        mentionText === "velora" ||
        availableProviders.some((p) => {
          const cleanName = getCleanModelName(p.id).toLowerCase();
          return cleanName === mentionText || p.id.toLowerCase() === mentionText;
        })
      );
    });
  };

  const hasMention = hasAiMention(input);

  const getMentionedModelId = () => {
    const mentions = input.match(/@([a-zA-Z0-9-:_/.]+)/g) || [];
    for (const m of mentions) {
      const mentionText = m.substring(1).toLowerCase();
      if (mentionText === "velora") return "gemini:gemini-3.1-flash-lite-preview";
      const provider = availableProviders.find(p => {
        const cleanName = getCleanModelName(p.id).toLowerCase();
        return cleanName === mentionText || p.id.toLowerCase() === mentionText;
      });
      if (provider) return provider.id;
    }
    return null;
  };

  const mentionedModelId = getMentionedModelId();
  const canUpload = mentionedModelId ? supportsVision(mentionedModelId) : false;

  useEffect(() => {
    if (!hasMention) {
      setWebSearchEnabled(false);
    }
  }, [hasMention]);

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
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Sync scroll positions and size height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200,
      )}px`;
    }
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [input]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const highlightMentions = (text: string) => {
    if (!text) return null;

    const parts: React.ReactNode[] = [];
    const regex = /(@[a-zA-Z0-9-:_/.]+)/g;
    const tokens = text.split(regex);

    tokens.forEach((token, i) => {
      if (token.match(regex)) {
        const mentionText = token.substring(1).toLowerCase();
        const isValidModel = mentionText === "velora" || availableProviders.some((p) => {
          const cleanName = getCleanModelName(p.id).toLowerCase();
          return cleanName === mentionText || p.id.toLowerCase() === mentionText;
        });

        if (isValidModel) {
          parts.push(
            <span key={i} className="text-emerald-400 font-medium">
              {token}
            </span>
          );
        } else {
          parts.push(token);
        }
      } else {
        parts.push(token);
      }
    });

    return parts;
  };

  const hasMultipleModelMentions = (text: string): boolean => {
    const mentions: string[] = text.match(/@([a-zA-Z0-9-:_/.]+)/g) || [];
    let count = 0;
    for (const m of mentions) {
      const mentionText = m.substring(1).toLowerCase();
      const isValidModel = mentionText === "velora" || availableProviders.some((p) => {
        const cleanName = getCleanModelName(p.id).toLowerCase();
        return cleanName === mentionText || p.id.toLowerCase() === mentionText;
      });
      if (isValidModel) {
        count++;
      }
    }
    return count > 1;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    if (isSending || isUploading) return;

    if (hasMultipleModelMentions(input)) {
      toast.error("Multiple AI model mentions are not allowed");
      return;
    }

    if (onTyping) {
      setIsCurrentlyTyping(false);
      onTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }

    setIsSending(true);
    try {
      await onSubmit(input, webSearchEnabled, attachments);
      setInput("");
      setWebSearchEnabled(false);
      setShowModelDropdown(false);
      setFilterText("");
      setAttachments([]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      setAttachments((prev) => [...prev, newAttachment]);
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
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectModel = (cleanModelName: string) => {
    if (!textareaRef.current) return;

    const selectionStart = textareaRef.current.selectionStart;
    const textBeforeCursor = input.substring(0, selectionStart);
    const textAfterCursor = input.substring(selectionStart);

    const lastAtPos = textBeforeCursor.lastIndexOf("@");
    if (lastAtPos !== -1) {
      // Check if there is already another model mention in the other parts of the input text
      const textBeforeAt = input.substring(0, lastAtPos);
      const textAfterAt = input.substring(selectionStart);
      const textWithoutCurrentTrigger = textBeforeAt + textAfterAt;
      const otherMentions: string[] = textWithoutCurrentTrigger.match(/@([a-zA-Z0-9-:_/.]+)/g) || [];

      const hasAnotherModel = otherMentions.some((m) => {
        const mentionText = m.substring(1).toLowerCase();
        return (
          mentionText === "velora" ||
          availableProviders.some((p) => {
            const cleanName = getCleanModelName(p.id).toLowerCase();
            return cleanName === mentionText || p.id.toLowerCase() === mentionText;
          })
        );
      });

      if (hasAnotherModel) {
        toast.error("Multiple AI model mentions are not allowed");
        setShowModelDropdown(false);
        return;
      }

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

  // Clamp activeIndex on filter change
  useEffect(() => {
    setActiveIndex(0);
  }, [filterText]);

  // Scroll active item into view snugly
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showModelDropdown && filteredProviders.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredProviders.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredProviders.length) % filteredProviders.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setActiveIndex((prev) => (prev - 1 + filteredProviders.length) % filteredProviders.length);
        } else {
          setActiveIndex((prev) => (prev + 1) % filteredProviders.length);
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selectedModel = filteredProviders[activeIndex];
        if (selectedModel) {
          handleSelectModel(getCleanModelName(selectedModel.id));
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowModelDropdown(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Typing acknowledgment triggers
    if (onTyping) {
      if (!isCurrentlyTyping && value.trim().length > 0) {
        setIsCurrentlyTyping(true);
        onTyping(true);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsCurrentlyTyping(false);
        onTyping(false);
      }, 3000);
    }

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
              {filteredProviders.map((p, index) => {
                const cleanModelName = getCleanModelName(p.id);
                const isActive = index === activeIndex;
                return (
                  <button
                    key={p.id}
                    ref={isActive ? activeItemRef : undefined}
                    type="button"
                    onClick={() => handleSelectModel(cleanModelName)}
                    data-active={isActive}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors group ${
                      isActive 
                        ? "bg-white text-black font-semibold shadow-md shadow-white/5" 
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
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
            {hasMention && (
              <WebSearchToggle
                enabled={webSearchEnabled}
                onToggle={setWebSearchEnabled}
              />
            )}
            {canUpload && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Upload image"
                >
                  {isUploading ? (
                    <Loader2 size={12} className="animate-spin text-white shrink-0" />
                  ) : (
                    <Paperclip size={12} className="shrink-0" />
                  )}
                  <span>Attach</span>
                </button>
              </>
            )}
            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">
              Type @ to search & mention AI models
            </div>
          </div>

          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-white/5">
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
            <div className="relative flex-1 min-w-0">
              {/* Backdrop highlight overlay */}
              <div
                ref={backdropRef}
                className="absolute inset-0 pointer-events-none select-none overflow-y-auto scrollbar-hide whitespace-pre-wrap break-words px-4 py-3.5 text-[0.95rem] md:text-[1rem] text-slate-100 bg-transparent border border-transparent"
                style={sharedTextStyles}
              >
                {highlightMentions(input)}
              </div>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                rows={1}
                placeholder="Message group..."
                className="relative w-full resize-none bg-transparent px-4 py-3.5 text-[0.95rem] md:text-[1rem] text-transparent caret-white placeholder-slate-600 outline-none overflow-y-auto scrollbar-hide max-h-50 md:max-h-75 min-h-12 md:min-h-14 block border border-transparent"
                style={sharedTextStyles}
              />
            </div>

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
                disabled={isSending || isUploading || (!input.trim() && attachments.length === 0)}
                className={`flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full mb-1.5 md:mb-2 transition-all duration-300 ${
                  isSending || isUploading || (!input.trim() && attachments.length === 0)
                    ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                    : "bg-white text-slate-900 hover:bg-slate-200"
                }`}
              >
                {isSending || isUploading ? (
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

export default memo(GroupInputArea);
