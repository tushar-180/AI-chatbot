import { memo, useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useGroupStore } from "@/features/chat/store/useGroupStore";
import { optimizeImageUrl } from "@/lib/utils";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Pencil,
  X,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Globe,
  Sparkles,
  Paperclip,
  Loader2,
  FileText,
  Bot,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color";
import { api } from "@/lib/api";
import { toast } from "sonner";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import { assistantMarkdownComponents } from "./MarkdownConfig";
import { supportsVision } from "@/features/chat/constants/chat.constants";

import type { Attachment } from "../types/chat.types";
import type { GroupMessage } from "../store/useGroupStore";

interface GroupMessageItemProps {
  message: GroupMessage;

  onCitationClick?: (id: number) => void;
  onSourcesClick?: (sources: any[], activeId?: number) => void;

  onEdit?: (content: string, webSearchEnabled?: boolean, attachments?: Attachment[], attachedFile?: File | null) => void;
  onEditStart?: () => void;

  onRetry?: (provider?: string, webSearchEnabled?: boolean) => void;

  onFeedback?: (feedback: "like" | "dislike" | null) => void;
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

const getModelOnlyName = (fullName: string) => {
  return fullName.includes(" : ") ? fullName.split(" : ")[1] : fullName;
};

const getCleanModelName = (id: string) => {
  const afterColon = id.includes(":") ? id.split(":")[1] : id;
  return afterColon.includes("/") ? afterColon.split("/").pop() || afterColon : afterColon;
};

let cachedProviders: Provider[] | null = null;
let providersPromise: Promise<Provider[]> | null = null;

const fetchProvidersGlobally = async () => {
  if (cachedProviders) return cachedProviders;
  if (providersPromise) return providersPromise;
  
  providersPromise = api.get("/ai/providers").then(res => {
    const rawProviders: Provider[] = res.data.providers || [];
    const defaultModelId = "gemini:gemini-3.1-flash-lite";
    const defaultModel = rawProviders.find((p: Provider) => p.id === defaultModelId);
    let sortedProviders = [...rawProviders];
    if (defaultModel) {
      sortedProviders = [defaultModel, ...rawProviders.filter((p: Provider) => p.id !== defaultModelId)];
    }
    cachedProviders = sortedProviders;
    return sortedProviders;
  }).catch(err => {
    console.error("Error fetching providers", err);
    providersPromise = null;
    return [];
  });
  
  return providersPromise;
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

const MessageAvatar = ({
  isUser,
  imageUrl,
  username,
  failed = false,
  size = 18,
}: {
  isUser: boolean;
  imageUrl?: string;
  username: string;
  failed?: boolean;
  size?: number;
}) => (
  <div
    className={`flex shrink-0 items-center justify-center rounded-lg overflow-hidden transition-all duration-300 not-selectable  ${
      failed ? "border border-red-500/20 bg-red-500/10" : ""
    }`}
    style={{ width: size, height: size }}
  >
    {isUser ? (
      imageUrl ? (
        <img src={optimizeImageUrl(imageUrl, (size || 18) * 2)} alt="User" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-emerald-500/10 text-emerald-500 font-bold text-[8px]">
          {username.substring(0, 1).toUpperCase()}
        </div>
      )
    ) : failed ? (
      <AlertCircle className="h-4 w-4 text-red-400" />
    ) : (
      <img
        src="/logo.png"
        alt="Velora Logo"
        className="h-full w-full object-contain "
      />
    )}
  </div>
);

const AttachmentList = ({ attachments }: { attachments: any[] }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className="group relative max-w-sm overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-md transition-all hover:border-white/20"
        >
          {attachment.mimeType?.startsWith("image/") ||
          attachment.url.startsWith("data:image") ? (
            <img
              src={optimizeImageUrl(attachment.url || "", 600)}
              alt={attachment.name || "Attachment"}
              className="h-auto w-full object-contain max-h-[32rem] bg-slate-950/40"
              fetchPriority="high"
            />
          ) : (
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <span className="text-xs font-bold uppercase tracking-tighter">
                  File
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-sm font-medium text-white truncate max-w-50">
                  {attachment.name || "File"}
                </span>

                {attachment.size && (
                  <span className="text-[10px] text-slate-400">
                    {(attachment.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const ALLOWED_HTML_TAGS = new Set([
  "a", "b", "i", "u", "strong", "em", "br", "hr", "code", "pre",
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "blockquote", "span", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "cite"
]);

function escapeUnrecognizedHtmlTags(text: string): string {
  return text.replace(/<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g, (match, closing, tagName, attributes) => {
    if (ALLOWED_HTML_TAGS.has(tagName.toLowerCase())) {
      return match;
    }
    return `&lt;${closing || ""}${tagName}${attributes || ""}&gt;`;
  });
}

const GroupMessageItem = ({
  message: msg,
  onCitationClick,
  onSourcesClick,
  onEdit,
  onEditStart,
  onRetry,
  onFeedback,
}: GroupMessageItemProps) => {
  const { user } = useUser();
  const dbUser = useChatStore((state) => state.dbUser);
  const { currentGroupId, groups } = useGroupStore();
  const currentGroup = groups.find((g) => g._id === currentGroupId);
  const members = currentGroup?.members || [];

  const messages = useGroupStore((state) => state.groupMessages);
  const isAssistant = msg.role === "assistant" || msg.userId === "velora";
  const isMe = msg.userId === user?.id && !isAssistant;
  
  let isRequester = msg.metadata?.requesterId === user?.id;
  if (msg.metadata?.requesterId === undefined && isAssistant) {
    const myIndex = messages.findIndex((m: GroupMessage) => m._id === msg._id);
    const prevMsg = myIndex > 0 ? messages[myIndex - 1] : null;
    if (prevMsg && prevMsg.role === "user") {
      isRequester = prevMsg.userId === user?.id;
    }
  }

  const isSystem = msg.role === "system";
  const isUser = msg.role === "user";

  const isFailed = msg.status === "failed";
  const isEdited = Boolean(msg.role === "user" && msg.updatedAt && msg.createdAt && new Date(msg.updatedAt).getTime() - new Date(msg.createdAt).getTime() > 2000);

  const [isExpanded, setIsExpanded] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [retryWebSearchEnabled, setRetryWebSearchEnabled] = useState(
    Boolean(msg.metadata?.webSearchEnabled)
  );
  const [isFocused, setIsFocused] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeItemRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);

  const CHAR_LIMIT = 500;
  const needsToggle = msg.content.length > CHAR_LIMIT;

  // Fetch providers unconditionally so valid mentions can be highlighted in sent messages
  useEffect(() => {
    fetchProvidersGlobally().then(providers => setAvailableProviders(providers));
  }, []);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [isEditing]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModelDropdown(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [editContent]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filterText]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

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

  const hasMention = hasAiMention(editContent);

  const getMentionedModelId = () => {
    const mentions: string[] = editContent.match(/@([a-zA-Z0-9-:_/.]+)/g) || [];
    for (const m of mentions) {
      const mentionText = m.substring(1).toLowerCase();
      if (mentionText === "velora") return "velora";
      const provider = availableProviders.find((p) => {
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

  const highlightMentions = (text: string) => {
    if (!text) return null;
    const parts: React.ReactNode[] = [];
    // Capture @word tokens, including an optional trailing space to detect "completed" mentions
    const regex = /(@[a-zA-Z0-9-:_/.]+)(\s?)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // Push text before this match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const fullToken = match[1]; // e.g. "@gemini-2.0-flash"
      const trailingSpace = match[2]; // "" or " "
      const mentionText = fullToken.substring(1).toLowerCase();

      const isValidModel = mentionText === "velora" || availableProviders.some((p) => {
        const cleanName = getCleanModelName(p.id).toLowerCase();
        return cleanName === mentionText || p.id.toLowerCase() === mentionText;
      });

      // Check if user is still typing (partial prefix, no trailing space)
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

    // Push remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleEditStart = () => {
    setIsEditing(true);
    setEditContent(msg.content);
    setAttachments(msg.attachments || []);
    setAttachedFile(null);
    onEditStart?.();
  };

  const handleExpantion = () => {
    if (isExpanded) {
      setIsExpanded(false);
      requestAnimationFrame(() => {
        setTimeout(() => {
          messageRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 30);
      });
    } else {
      setIsExpanded(true);
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditContent(msg.content);
    setShowModelDropdown(false);
    setFilterText("");
    setAttachedFile(null);
  };

  const handleEditSave = () => {
    const contentChanged = editContent.trim() !== msg.content;
    const attachmentsChanged =
      JSON.stringify(attachments) !== JSON.stringify(msg.attachments || []);
    const hasNewFile = Boolean(attachedFile);

    if (!editContent.trim()) {
      setIsEditing(false);
      setShowModelDropdown(false);
      return;
    }

    if (contentChanged || attachmentsChanged || hasNewFile) {
      onEdit?.(editContent, webSearchEnabled, attachments, attachedFile);
    }
    setIsEditing(false);
    setShowModelDropdown(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const formData = new FormData();
      formData.append("image", file);

      setIsUploading(true);
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
      } catch (err) {
        console.error("Failed to upload image:", err);
      } finally {
        setIsUploading(false);
      }
    } else {
      setAttachedFile(file);
      const newDocAttachment: Attachment = {
        url: "",
        name: file.name,
        mimeType: file.type,
        size: file.size,
      };
      setAttachments((prev) => [...prev, newDocAttachment]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (attachedFile && removed.name === attachedFile.name) {
        setAttachedFile(null);
      }
      return updated;
    });
  };

  const handleSelectMention = (mentionName: string, type: "user" | "model" | "everyone") => {
    if (!textareaRef.current) return;
    const selectionStart = textareaRef.current.selectionStart;
    const textBeforeCursor = editContent.substring(0, selectionStart);
    const textAfterCursor = editContent.substring(selectionStart);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");
    if (lastAtPos !== -1) {
      if (type === "model") {
        const textBeforeAt = editContent.substring(0, lastAtPos);
        const textAfterAt = editContent.substring(selectionStart);
        const textWithoutCurrentTrigger = textBeforeAt + textAfterAt;
        const otherMentions: string[] = textWithoutCurrentTrigger.match(/@([a-zA-Z0-9-:_/.]+)/g) || [];
        const hasAnotherModel = otherMentions.some((m) => {
          const mentionText = m.substring(1).toLowerCase();
          return mentionText === "velora" || availableProviders.some((p) => {
            const cleanName = getCleanModelName(p.id).toLowerCase();
            return cleanName === mentionText || p.id.toLowerCase() === mentionText;
          });
        });
        if (hasAnotherModel) {
          toast.error("Multiple AI model mentions are not allowed");
          setShowModelDropdown(false);
          return;
        }
      }
      const insertText = `@${mentionName} `;
      const newInput = editContent.substring(0, lastAtPos) + insertText + textAfterCursor;
      setEditContent(newInput);
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
        setActiveIndex((prev) => e.shiftKey ? (prev - 1 + dropdownOptions.length) % dropdownOptions.length : (prev + 1) % dropdownOptions.length);
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
      handleEditSave();
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setEditContent(value);
    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, selectionStart);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith("@")) {
      setShowModelDropdown(true);
      setFilterText(lastWord.substring(1).toLowerCase());
    } else {
      setShowModelDropdown(false);
      setFilterText("");
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const sharedTextStyles: React.CSSProperties = {
    lineHeight: "1.5rem",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    letterSpacing: "inherit",
    boxSizing: "border-box",
    margin: 0,
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-6">
        <span className="px-4 py-1.5 rounded-full bg-white/[0.03] text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 border border-white/[0.05] backdrop-blur-sm">
          {msg.content}
        </span>
      </div>
    );
  }

  const displayImageUrl = isMe ? (dbUser?.imageUrl || user?.imageUrl) : msg.userImage;

  const formatBadgeText = (model: string) => {
    if (model.toLowerCase().startsWith("gemini-")) {
      const subName = model.substring("gemini-".length);

      return `Gemini : ${subName}`;
    }

    const firstDash = model.indexOf("-");

    if (firstDash !== -1) {
      const provider = model.substring(0, firstDash);
      const subName = model.substring(firstDash + 1);

      return `${provider.charAt(0).toUpperCase() + provider.slice(1)} : ${subName}`;
    }

    return model;
  };

  const renderUsername = () => {
    if (isMe) {
      return (
        <span className="flex items-center gap-1">
          {isEdited && <span className="text-[12px] lowercase text-slate-500 font-normal tracking-normal">(edited)</span>}
          <span className="text-emerald-400">You</span>
        </span>
      );
    }

    const name = msg.username || "Velora";

    const match = name.match(/^Velora \(([^)]+)\)$/i);

    if (match) {
      const model = match[1];

      return (
        <span className="flex items-center gap-2 not-selectable">
          <span className="text-slate-300 font-bold tracking-[0.18em]">
            Velora
          </span>

          <span className="flex items-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
            {formatBadgeText(model)}
          </span>

          {msg.metadata?.webSearchEnabled && (
            <span className="flex items-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
              web search
            </span>
          )}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1">
        <span
          className={
            isAssistant
              ? isFailed
                ? "text-red-400"
                : "text-slate-500"
              : "text-slate-400"
          }
        >
          {name}
        </span>
        {isEdited && !isAssistant && <span className="text-[12px] lowercase text-slate-500 font-normal tracking-normal">(edited)</span>}
      </span>
    );
  };

  let processedContent = msg.content || "";

  if (isAssistant) {
    processedContent = processedContent.replace(
      /\[(\d+)\]/g,
      '<cite data-id="$1"></cite>',
    );
  } else {
    processedContent = processedContent.replace(
      /(?:^|\s)@([a-zA-Z0-9-:_/.]+)/g,
      (match) => {
        const hasLeadingSpace =
          match.startsWith(" ") ||
          match.startsWith("\n") ||
          match.startsWith("\r");

        const mentionText = match.trim();
        const mentionTarget = mentionText.substring(1).toLowerCase();

        const isValidModel = mentionTarget === "velora" || availableProviders.some((p) => {
          const cleanName = getCleanModelName(p.id).toLowerCase();
          return cleanName === mentionTarget || p.id.toLowerCase() === mentionTarget;
        });

        const isUserMatch = mentionTarget === "everyone" || members.some(m => m.username.toLowerCase() === mentionTarget);

        if (isValidModel) {
          return (
            (hasLeadingSpace ? " " : "") +
            `<span class="text-emerald-400 font-medium">${mentionText}</span>`
          );
        } else if (isUserMatch) {
          return (
            (hasLeadingSpace ? " " : "") +
            `<span class="text-orange-400 font-medium">${mentionText}</span>`
          );
        }

        return match;
      },
    );
  }

  // Escape any unrecognized HTML tags to prevent custom element warning in React & preserve plain text display
  processedContent = escapeUnrecognizedHtmlTags(processedContent);

  const citationComponents = isAssistant
    ? {
        ...assistantMarkdownComponents,

        cite: ({ node }: any) => {
          const id = Number(node?.properties?.dataId);

          if (isNaN(id)) return null;

          return (
            <button
              onClick={(e) => {
                e.preventDefault();

                if (msg.sources?.length) {
                  onSourcesClick?.(msg.sources, id);
                } else {
                  onCitationClick?.(id);
                }
              }}
              className="inline-flex items-center justify-center w-5 h-5 mx-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold hover:bg-indigo-500/40 transition"
              title={`Source ${id}`}
            >
              {id}
            </button>
          );
        },
      }
    : undefined;

  return (
    <div
      className={`group flex w-full ${isMe ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex w-full gap-4  ${
          isMe
            ? "max-w-full md:max-w-4xl flex-row-reverse"
            : "max-w-full md:max-w-5xl flex-row items-start"
        }`}
      >
        <div
          className={`flex flex-col gap-2 min-w-0 flex-1 ${
            isMe ? "items-end" : "items-start"
          }`}
        >
          <div
            className={`flex items-center gap-2 ${
              isMe ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <MessageAvatar
              isUser={!isAssistant}
              imageUrl={displayImageUrl}
              username={msg.username}
              failed={isFailed}
              size={16}
            />

            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] not-selectable">
              {renderUsername()}
            </span>
          </div>

          <div
            ref={messageRef}
            className={`transition-opacity duration-150 ease-out ${
              isMe
                ? `w-fit max-w-full min-w-0 ${isEditing ? "overflow-visible" : "overflow-hidden"} rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5 text-base leading-[1.8] tracking-[0.01em] text-white shadow-sm`
                : isFailed
                  ? `w-fit max-w-full min-w-0 ${isEditing ? "overflow-visible" : "overflow-hidden"} rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-3.5 text-base leading-[1.8] text-red-300 shadow-sm`
                  : isAssistant
                    ? `w-full max-w-full min-w-0 ${isEditing ? "overflow-visible" : "overflow-hidden"} py-1 text-base leading-[1.8] text-slate-200`
                    : `w-fit max-w-full min-w-0 ${isEditing ? "overflow-visible" : "overflow-hidden"} rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5 text-base leading-[1.8] tracking-[0.01em] text-white shadow-sm`
            }`}
          >
            {isEditing ? (
              <div className="flex flex-col gap-3 w-full min-w-[200px] md:min-w-[400px] relative">
                {showModelDropdown && dropdownOptions.length > 0 && (
                  <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200 scrollbar-hide">
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
                            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors group ${
                              isActive 
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
                
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {attachments.map((attachment, index) => (
                      <div key={index} className="group relative">
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="absolute -right-2 -top-2 z-10 hidden h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white group-hover:flex border border-white/10"
                        >
                          <X size={12} />
                        </button>
                        {attachment.mimeType?.startsWith("image/") ? (
                          <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10">
                            <img
                              src={attachment.url || (attachedFile ? URL.createObjectURL(attachedFile) : "")}
                              alt={attachment.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-16 w-48 items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-indigo-500/20 text-indigo-400">
                              <FileText size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-white">
                                {attachment.name}
                              </p>
                              {attachment.size && (
                                <p className="text-[10px] text-slate-400">
                                  {(attachment.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="relative w-full rounded-2xl border border-white/20 bg-white/5 ring-1 ring-white/5">
                  <div
                    ref={backdropRef}
                    className="absolute inset-0 pointer-events-none select-none overflow-y-auto whitespace-pre-wrap break-words px-4 py-3.5 text-[0.95rem] md:text-base text-slate-100 bg-transparent"
                    style={sharedTextStyles}
                  >
                    {highlightMentions(editContent)}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    onCopy={(e) => {
                      if (!isFocused) e.preventDefault();
                    }}
                    onSelect={(e) => {
                      if (!isFocused) {
                        const el = e.currentTarget;
                        requestAnimationFrame(() => el.selectionStart = el.selectionEnd);
                      }
                    }}
                    className={`${ isFocused ? "" : "selection:bg-transparent select-none" } not-selectable relative w-full resize-none bg-transparent px-4 py-3.5 text-[0.95rem] md:text-base text-transparent caret-white placeholder-slate-500 outline-none focus:ring-0 overflow-y-auto block min-h-[1.5em] border-none`}
                    rows={1}
                    style={sharedTextStyles}
                  />
                </div>

                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center gap-2">
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
                          accept="image/*,.pdf,.doc,.docx,.txt"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                        >
                          {isUploading ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Paperclip size={14} />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleEditCancel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors"
                    >
                      <X size={14} />
                      Cancel
                    </button>

                    <button
                      onClick={handleEditSave}
                      disabled={!editContent.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
                    >
                      <Check size={14} />
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : isFailed ? (
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-red-300">
                  AI Response Failed
                </span>

                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={assistantMarkdownComponents}
                >
                  {msg.content ||
                    "The AI model failed to respond. Please try again."}
                </ReactMarkdown>
              </div>
            ) : (
              <>
                {msg.content && (
                  <div
                    className={
                      isUser ? "wrap-break-word whitespace-pre-wrap" : ""
                    }
                  >
                    <div
                      className={
                        isUser
                          ? `relative ${
                              !isExpanded && needsToggle ? "line-clamp-10" : ""
                            }`
                          : ""
                      }
                    >
                      {isUser ? (
                        <div
                          className="whitespace-pre-wrap break-words text-white"
                          dangerouslySetInnerHTML={{ __html: processedContent }}
                        />
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={citationComponents}
                        >
                          {processedContent}
                        </ReactMarkdown>
                      )}
                    </div>

                    {needsToggle && isUser && (
                      <button
                        onClick={handleExpantion}
                        className="mt-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <div className="flex gap-2 justify-center items-center not-selectable">
                          {isExpanded ? (
                            <>
                              Show less <ChevronUp size={14} />
                            </>
                          ) : (
                            <>
                              Show more <ChevronDown size={14} />
                            </>
                          )}
                        </div>
                      </button>
                    )}
                  </div>
                )}
                {!isAssistant && (
                  <AttachmentList attachments={msg.attachments || []} />
                )}

              </>
            )}
          </div>

          {/* Assistant Actions */}
          {isAssistant && !isEditing && (
            <div className=" flex items-center gap-1 opacity-100 transition-all duration-200">
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy"
              >
                {copied ? (
                  <Check size={17} className="text-emerald-500" />
                ) : (
                  <Copy size={17} />
                )}
              </button>
              {/* Like button with per-user reactions */}
              {(() => {
                const reactions = msg.reactions || [];
                const likes = reactions.filter((r) => r.type === "like");
                const myLike = likes.some((r) => r.userId === user?.id);

                return (
                  <div className="relative group/like">
                    <button
                      onClick={() =>
                        onFeedback?.(myLike ? null : "like")
                      }
                      className={`p-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1 ${
                        myLike
                          ? "text-indigo-400 bg-indigo-500/10"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                      title="Like"
                    >
                      <ThumbsUp
                        size={17}
                        fill={myLike ? "currentColor" : "none"}
                      />
                      {likes.length > 0 && (
                        <span className="text-[11px] font-semibold tabular-nums leading-none">
                          {likes.length}
                        </span>
                      )}
                    </button>

                    {likes.length > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl bg-slate-800 border border-white/10 shadow-2xl text-[11px] text-slate-200 whitespace-nowrap opacity-0 pointer-events-none group-hover/like:opacity-100 group-hover/like:pointer-events-auto transition-all duration-200 z-50">
                        <div className="flex flex-col gap-0.5">
                          {likes.map((r) => (
                            <span key={r.userId} className="font-medium">
                              {r.userId === user?.id ? "You" : r.username}
                            </span>
                          ))}
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-slate-800" />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dislike button with per-user reactions */}
              {(() => {
                const reactions = msg.reactions || [];
                const dislikes = reactions.filter((r) => r.type === "dislike");
                const myDislike = dislikes.some((r) => r.userId === user?.id);

                return (
                  <div className="relative group/dislike">
                    <button
                      onClick={() =>
                        onFeedback?.(myDislike ? null : "dislike")
                      }
                      className={`p-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1 ${
                        myDislike
                          ? "text-red-400 bg-red-500/10"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                      title="Dislike"
                    >
                      <ThumbsDown
                        size={17}
                        fill={myDislike ? "currentColor" : "none"}
                      />
                      {dislikes.length > 0 && (
                        <span className="text-[11px] font-semibold tabular-nums leading-none">
                          {dislikes.length}
                        </span>
                      )}
                    </button>

                    {dislikes.length > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl bg-slate-800 border border-white/10 shadow-2xl text-[11px] text-slate-200 whitespace-nowrap opacity-0 pointer-events-none group-hover/dislike:opacity-100 group-hover/dislike:pointer-events-auto transition-all duration-200 z-50">
                        <div className="flex flex-col gap-0.5">
                          {dislikes.map((r) => (
                            <span key={r.userId} className="font-medium">
                              {r.userId === user?.id ? "You" : r.username}
                            </span>
                          ))}
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-slate-800" />
                      </div>
                    )}
                  </div>
                );
              })()}

              {onRetry && isRequester && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                      title="Regenerate response"
                    >
                      <RotateCcw size={17} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="end"
                    className="w-48 bg-slate-900 border-slate-800"
                    collisionPadding={{ top: 100, bottom: 200 }}
                  >
                    <DropdownMenuCheckboxItem
                      checked={retryWebSearchEnabled}
                      onCheckedChange={setRetryWebSearchEnabled}
                      onSelect={(e) => e.preventDefault()}
                      className="text-slate-200 focus:bg-slate-800 focus:text-slate-100 cursor-pointer"
                    >
                      <Globe size={14} className="mr-2 opacity-70" />
                      Web Search
                    </DropdownMenuCheckboxItem>
                    
                    <DropdownMenuSeparator className="bg-slate-800" />
                    
                    <DropdownMenuItem
                      onClick={() => onRetry(msg.model, retryWebSearchEnabled)}
                      className="text-slate-200 focus:bg-slate-800 focus:text-slate-100 cursor-pointer"
                    >
                      <RotateCcw size={14} className="mr-2 opacity-70" />
                      Try Again
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="text-slate-200 focus:bg-slate-800 focus:text-slate-100 cursor-pointer">
                        <Bot size={14} className="mr-2 opacity-70" />
                        Select Another Model
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent 
                        className="bg-slate-900 border-slate-800 max-h-48 overflow-y-auto"
                        collisionPadding={{ top: 100, bottom: 200 }}
                      >
                        {availableProviders.map((provider) => (
                          <DropdownMenuItem
                            key={provider.id}
                            onClick={() => onRetry(provider.id, retryWebSearchEnabled)}
                            className="text-slate-200 focus:bg-slate-800 focus:text-slate-100 cursor-pointer flex items-center gap-2"
                          >
                            {getProviderIcon(provider.id, 12)}
                            <span className="capitalize">{getModelOnlyName(provider.name)}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!!msg.sources?.length && (
                <button
                  onClick={() => {
                    if (msg.sources?.length) {
                      onSourcesClick?.(msg.sources, msg.sources[0]?.id);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg hover:bg-slate-800 bg-slate-900 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                  title="View sources"
                >
                  Sources
                </button>
              )}
            </div>
          )}

          {/* User Actions */}
          {isMe && !isEditing && (
            <div className="flex items-center gap-1 opacity-100 transition-all duration-200">
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy"
              >
                {copied ? (
                  <Check size={17} className="text-emerald-500" />
                ) : (
                  <Copy size={17} />
                )}
              </button>

              <button
                onClick={handleEditStart}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Edit"
              >
                <Pencil size={17} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const areEqual = (
  prev: GroupMessageItemProps,
  next: GroupMessageItemProps,
) => {
  return (
    prev.message._id === next.message._id &&
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.message.reactions === next.message.reactions &&
    prev.message.username === next.message.username &&
    prev.message.userImage === next.message.userImage &&
    prev.message.attachments === next.message.attachments &&
    prev.message.sources === next.message.sources &&
    prev.message.metadata?.webSearchEnabled === next.message.metadata?.webSearchEnabled
  );
};

export default memo(GroupMessageItem, areEqual);
