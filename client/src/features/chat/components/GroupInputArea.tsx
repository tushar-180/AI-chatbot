import React, { useState, useRef, useEffect, memo } from "react";
import { ArrowUp, Loader2, Users, Sparkles, Globe, Square, Mic, Paperclip, X, FileText } from "lucide-react";
import { useParams } from "react-router-dom";
import { useGroupStore } from "@/features/chat/store/useGroupStore";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useVoiceInput } from "@/features/chat/hooks/useVoiceInput";
import type { Attachment } from "@/features/chat/hooks/useChatInput";
import { supportsVision } from "@/features/chat/constants/chat.constants";

interface GroupInputAreaProps {
  onSubmit: (content: string, webSearchEnabled?: boolean, attachments?: Attachment[], attachedFile?: File | null) => Promise<void>;
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
    gemini: GeminiColor,
    claude: AnthropicMono,
    openai: OpenAIMono,
    nvidia: NvidiaColor,
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
      className={`flex items-center gap-1.5 lg:gap-2 rounded-lg border transition-all px-2 py-0.5 lg:px-2.5 lg:py-1 text-[10px] font-semibold lg:font-bold lg:uppercase tracking-normal lg:tracking-widest cursor-pointer ${enabled
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-400/20 hover:text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.15)]"
          : "border-white/10 bg-white/5 text-slate-400 lg:text-slate-500 hover:border-white/20 hover:bg-white/10 hover:text-white"
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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { groupId } = useParams<{ groupId?: string }>();
  const { currentGroupId, groups } = useGroupStore();
  const currentGroup = groups.find((g) => g._id === (groupId || currentGroupId));
  const members = currentGroup?.members || [];
  const [isFocused, setIsFocused] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Clear typed input, attachments, and reset web search when switching group chats
  useEffect(() => {
    setInput("");
    setAttachments([]);
    setAttachedFile(null);
    setWebSearchEnabled(false);
  }, [groupId]);

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
      if (mentionText === "velora") return "gemini:gemini-3.1-flash-lite";
      const provider = availableProviders.find(p => {
        const cleanName = getCleanModelName(p.id).toLowerCase();
        return cleanName === mentionText || p.id.toLowerCase() === mentionText;
      });
      if (provider) return provider.id;
    }
    return null;
  };

  const mentionedModelId = getMentionedModelId();
  const canUpload = mentionedModelId ? supportsVision(mentionedModelId) : true;

  useEffect(() => {
    if (!hasMention) {
      setWebSearchEnabled(false);
    }
    if (!canUpload) {
      setAttachments([]);
      setAttachedFile(null);
    }
  }, [hasMention, canUpload]);

  // Fetch AI providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await api.get("/ai/providers");
        const rawProviders: Provider[] = res.data.providers || [];

        // Find "gemini:gemini-3.1-flash-lite"
        const defaultModelId = "gemini:gemini-3.1-flash-lite";
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
    const handle = requestAnimationFrame(() => {
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
    });
    return () => cancelAnimationFrame(handle);
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
    const regex = /(@[a-zA-Z0-9-:_/.]+)(\s?)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const fullToken = match[1];
      const trailingSpace = match[2];
      const mentionText = fullToken.substring(1).toLowerCase();

      const isValidModel = mentionText === "velora" || availableProviders.some((p) => {
        const cleanName = getCleanModelName(p.id).toLowerCase();
        return cleanName === mentionText || p.id.toLowerCase() === mentionText;
      });

      const isPartialMatch = !trailingSpace && !isValidModel && availableProviders.some((p) => {
        const cleanName = getCleanModelName(p.id).toLowerCase();
        return cleanName.startsWith(mentionText) || p.id.toLowerCase().startsWith(mentionText);
      });

      const isUserMatch = mentionText === "everyone" || members.some(m => m.username.toLowerCase() === mentionText);
      const isUserPartialMatch = !trailingSpace && !isUserMatch && ("everyone".startsWith(mentionText) || members.some(m => m.username.toLowerCase().startsWith(mentionText)));

      if (isValidModel) {
        parts.push(
          <span key={match.index} className="text-emerald-400 font-medium">
            {fullToken}
          </span>
        );
        if (trailingSpace) parts.push(trailingSpace);
      } else if (isPartialMatch) {
        parts.push(
          <span key={match.index} className="text-emerald-400/60 font-medium">
            {fullToken}
          </span>
        );
        if (trailingSpace) parts.push(trailingSpace);
      } else if (isUserMatch) {
        parts.push(
          <span key={match.index} className="text-orange-400 font-medium">
            {fullToken}
          </span>
        );
        if (trailingSpace) parts.push(trailingSpace);
      } else if (isUserPartialMatch) {
        parts.push(
          <span key={match.index} className="text-orange-400/60 font-medium">
            {fullToken}
          </span>
        );
        if (trailingSpace) parts.push(trailingSpace);
      } else {
        parts.push(fullToken + trailingSpace);
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

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
    if (!input.trim() && attachments.length === 0 && !attachedFile) return;
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
    if (attachments.length > 0 || attachedFile) {
      setCooldown(30);
    }
    try {
      await onSubmit(input, webSearchEnabled, attachments, attachedFile);
      setInput("");
      setWebSearchEnabled(false);
      setShowModelDropdown(false);
      setFilterText("");
      setAttachments([]);
      setAttachedFile(null);
    } finally {
      setIsSending(false);
    }
  };

  const ALLOWED_FILE_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // "application/vnd.ms-powerpoint",
    // "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/csv",
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isDocument = ALLOWED_FILE_TYPES.includes(file.type);

    if (attachments.length > 0 || attachedFile) {
      toast.error("You can only upload one file per message.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (isDocument) {
      setAttachedFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!isImage) {
      toast.error("Only images and documents (.pdf, .doc, etc) are supported.");
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      const res = await api.post("/upload/image", formData);

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

  const handleSelectMention = (mentionName: string, type: "user" | "model" | "everyone") => {
    if (!textareaRef.current) return;

    const selectionStart = textareaRef.current.selectionStart;
    const textBeforeCursor = input.substring(0, selectionStart);
    const textAfterCursor = input.substring(selectionStart);

    const lastAtPos = textBeforeCursor.lastIndexOf("@");
    if (lastAtPos !== -1) {
      if (type === "model") {
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
      }

      const insertText = `@${mentionName} `;
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

  const filteredUsers = filterText ? members.filter((m) => m.username.toLowerCase().includes(filterText)) : members;
  const filteredModels = availableProviders.filter((p) => {
    const cleanModelName = getCleanModelName(p.id).toLowerCase();
    const searchString = `${cleanModelName} ${p.name}`.toLowerCase();
    return searchString.includes(filterText);
  });

  const isEveryoneMatch = "everyone".includes(filterText);

  const dropdownOptions = [
    ...(isEveryoneMatch ? [{ type: "everyone" as const, id: "everyone", name: "everyone", originalName: "everyone", avatar: undefined }] : []),
    ...filteredUsers.map(m => ({ type: "user" as const, id: m.userId, name: m.username, originalName: m.username, avatar: m.userImage })),
    ...filteredModels.map(p => ({ type: "model" as const, id: p.id, name: getCleanModelName(p.id), originalName: p.name }))
  ];

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
    if (showModelDropdown && dropdownOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % dropdownOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + dropdownOptions.length) % dropdownOptions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setActiveIndex((prev) => (prev - 1 + dropdownOptions.length) % dropdownOptions.length);
        } else {
          setActiveIndex((prev) => (prev + 1) % dropdownOptions.length);
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selected = dropdownOptions[activeIndex];
        if (selected) {
          handleSelectMention(selected.name, selected.type);
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
    <div className="sticky bottom-0 z-30 pb-4 lg:pb-8 px-4 lg:px-10 pointer-events-none not-selectable ">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-4xl relative pointer-events-auto"
      >
        {/* Model dropdown popover */}
        {showModelDropdown && dropdownOptions.length > 0 && (
          <div className="absolute bottom-full left-4 z-50 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200 scrollbar-hide">
            <div className="mb-1.5 flex items-center justify-between border-b border-white/5 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              <span className="flex items-center gap-1.5">
                <Sparkles size={10} className="text-emerald-400" />
                Choose Mention
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
              {dropdownOptions.map((opt, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={opt.id + opt.type}
                    ref={isActive ? activeItemRef : undefined}
                    type="button"
                    onClick={() => handleSelectMention(opt.name, opt.type)}
                    data-active={isActive}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors group ${isActive
                        ? "bg-white text-black font-semibold shadow-md shadow-white/5"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                  >
                    {opt.type === "model" ? (
                      getProviderIcon(opt.id, 12)
                    ) : opt.type === "everyone" ? (
                      <div className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                        @
                      </div>
                    ) : opt.avatar ? (
                      <img src={opt.avatar} alt={opt.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[8px] font-bold shrink-0">
                        {opt.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate capitalize">
                      @{opt.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="group relative flex flex-col gap-0 rounded-3xl border border-white/10 bg-slate-900/80 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 focus-within:border-white/20 backdrop-blur-2xl">
          {/* Top Label */}
          <div className="flex flex-wrap items-center gap-1.5 lg:gap-2 px-3 lg:px-4 pt-2 lg:pt-3">
            <div className="flex items-center gap-1.5 lg:gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 lg:px-2.5 lg:py-1 text-[10px] font-semibold lg:font-bold lg:uppercase tracking-normal lg:tracking-widest text-emerald-300">
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
                  accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 lg:gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 lg:px-2.5 lg:py-1 text-[10px] font-semibold lg:font-bold lg:uppercase tracking-normal lg:tracking-widest text-slate-400 lg:text-slate-500 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
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
            <div className="hidden lg:block text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
              Type @ to mention users or AI models
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

          {/* Document Previews */}
          {attachedFile && (
            <div className="flex flex-wrap gap-2 px-4 py-2">
              <div className="group/att relative h-16 w-16 rounded-lg overflow-hidden border border-white/10 bg-white/5 flex flex-col items-center justify-center">
                <FileText size={20} className="text-slate-300 shrink-0" />
                <span className="mt-1 line-clamp-2 text-[9px] text-slate-400 text-center">
                  {attachedFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-1.5 lg:gap-2 pr-2 pb-1.5 lg:pb-2 pl-2 lg:pl-0">
            <div className="relative flex-1 min-w-0">
              {/* Backdrop highlight overlay */}
              <div
                ref={backdropRef}
                className="absolute inset-0 pointer-events-none select-none overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 lg:px-4 lg:py-3.5 text-[0.95rem] lg:text-[1rem] text-slate-100 bg-transparent border border-transparent"
                style={sharedTextStyles}
              >
                {highlightMentions(input)}
              </div>

              <textarea
                ref={textareaRef}
                value={input}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                // Prevent copy when NOT focused
                onCopy={(e) => {
                  if (!isFocused) {
                    e.preventDefault();
                  }
                }}
                // Prevent selection when NOT focused
                onSelect={(e) => {
                  if (!isFocused) {
                    const el = e.currentTarget;

                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd;
                    });
                  }
                }}
                rows={1}
                placeholder={
                  cooldown > 0
                    ? `Cooling down... Please wait ${cooldown}s`
                    : "Message group..."
                }
                className={`${isFocused ? "" : "selection:bg-transparent select-none"} not-selectable relative w-full resize-none bg-transparent px-3 py-2 lg:px-4 lg:py-3.5 text-[0.95rem] lg:text-[1rem] text-transparent caret-white placeholder-slate-600 outline-none overflow-y-auto max-h-50 lg:max-h-75 min-h-9 lg:min-h-14 block border border-transparent`}
                style={sharedTextStyles}
              />
            </div>

            <div className="flex items-end gap-1.5 lg:gap-2 pb-1 lg:pb-2">
              {/* Mic button */}
              <button
                type="button"
                onClick={() => {
                  if (isListening) {
                    stop();
                  } else {
                    start();
                  }
                }}
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-300 lg:h-10 lg:w-10 cursor-pointer ${isListening
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
                  className="flex h-9 w-9 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 hover:bg-rose-50 transition-all duration-300 group cursor-pointer"
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
                  disabled={isSending || isUploading || cooldown > 0 || (!input.trim() && attachments.length === 0)}
                  className={`flex h-9 w-9 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${isSending || isUploading || cooldown > 0 || (!input.trim() && attachments.length === 0)
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                      : "bg-white text-slate-900 hover:bg-slate-200 cursor-pointer"
                    }`}
                  aria-label={isSending || isUploading ? "Sending..." : "Send message"}
                  title={isSending || isUploading ? "Sending..." : "Send message"}
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
        </div>
      </form>
    </div>
  );
};

export default memo(GroupInputArea);
