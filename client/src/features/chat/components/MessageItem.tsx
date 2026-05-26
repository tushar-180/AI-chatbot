import { memo, useState, useRef, useEffect, type ComponentType } from "react";
import { useUser } from "@clerk/react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { optimizeImageUrl } from "@/lib/utils";

import {
  User,
  Globe,
  Pencil,
  Check,
  X,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Loader2,
  Image as ImageIcon,
  FileText,
  Table,
  MonitorPlay,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DEFAULT_CHAT_PROVIDER, supportsVision } from "../constants/chat.constants";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { WebSource, Message, Attachment } from "../types/chat.types";
import { assistantMarkdownComponents } from "./MarkdownConfig";
import { formatModelName } from "../constants/chat.constants";
import { useAvailableProviders } from "@/features/chat/hooks/useAvailableProviders";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color";

const CHAT_PROVIDER_STORAGE_KEY = "selected_chat_provider";

const getStoredProvider = () => {
  if (typeof window === "undefined") {
    return DEFAULT_CHAT_PROVIDER;
  }

  return (
    window.localStorage.getItem(CHAT_PROVIDER_STORAGE_KEY) ||
    DEFAULT_CHAT_PROVIDER
  );
};

const getProviderIcon = (providerId: string, size = 14) => {
  const p = providerId.split(":")[0].toLowerCase();
  const mapping: Record<string, ComponentType<{ size?: number }>> = {
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

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (content: string, options?: { provider?: string; webSearchEnabled?: boolean; attachments?: any[]; attachedFile?: File | null }) => void;
  onEditStart?: () => void;
  onRetry?: () => void;
  onFeedback?: (feedback: "like" | "dislike" | null) => void;
  highlight?: string;
  onCitationClick?: (id: number) => void;
  onSourcesClick?: (sources: WebSource[], activeId?: number) => void;
}

/**
 * Renders a list of attachments (e.g. images)
 */
const AttachmentList = ({ attachments }: { attachments: Attachment[] }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className="group relative max-w-sm overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-md transition-all hover:border-white/20"
        >
          {attachment.mimeType?.startsWith("image/") ||
            attachment.url?.startsWith("data:image") ? (
            <img
              src={attachment.url || ""}
              alt={attachment.name || "Attachment"}
              className="h-auto w-full object-contain max-h-100"
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

/**
 * Avatar component for the message
 */
const MessageAvatar = ({
  isUser,
  imageUrl,
  failed,
}: {
  isUser: boolean;
  imageUrl?: string;
  failed?: boolean;
}) => (
  <div
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl overflow-hidden transition-all duration-300 ${isUser ? "border border-white/[0.08] shadow-sm" : ""
      } ${failed ? "bg-red-500/10 border-red-500/20" : ""}`}
  >
    {isUser ? (
      imageUrl ? (
        <img src={optimizeImageUrl(imageUrl, 64)} alt="User" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-slate-500">
          <User size={16} />
        </div>
      )
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        {failed ? (
          <AlertCircle className="h-4 w-4 text-red-400" />
        ) : (
          <img
            src="/logo.png"
            alt="Velora Logo"
            className="h-6 w-6 object-contain"
          />
        )}
      </div>
    )}
  </div>
);

/**
 * Metadata component (Role name and Model badge)
 */
const MessageMetadata = ({
  isUser,
  model,
  tokens,
  isStreaming,
  content,
  isEdited,
}: {
  isUser: boolean;
  model?: string;
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isStreaming?: boolean;
  content?: string;
  isEdited?: boolean;
}) => {
  const estimatedCompletionTokens = content
    ? Math.ceil(content.length / 4)
    : 0;

  return (
    <div
      className={`flex items-center gap-2.5 not-selectable ${isUser ? "flex-row-reverse" : "flex-row"
        }`}
    >
      <span
        className={`text-[11px] font-semibold uppercase tracking-[0.18em] flex items-center gap-1 ${isUser ? "text-slate-400" : "text-slate-500"
          } ${isUser ? "mr-0.5" : "ml-0.5"}`}
      >
        {Boolean(isEdited) && isUser && <span className="text-[12px] lowercase text-slate-500 font-normal tracking-normal">(edited)</span>}
        <span>{isUser ? "You" : "Velora"}</span>
      </span>

      {!isUser && model && (
        <span className="flex items-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
          {formatModelName(model)}
        </span>
      )}

      {!isUser && isStreaming && (
        <>
          {!content ? (
            <span className="flex items-center rounded-md border border-indigo-500/20 bg-indigo-500/5 px-2 py-0.5 text-[9px] font-mono text-indigo-400/90 animate-pulse">
              Thinking...
            </span>
          ) : (
            <span className="flex items-center rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-mono text-indigo-400 animate-pulse">
              {estimatedCompletionTokens} tokens generating...
            </span>
          )}
        </>
      )}

      {!isUser && !isStreaming && tokens && tokens.completionTokens > 0 && (
        <span className="flex items-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[9px] font-mono text-slate-500">
          {tokens.completionTokens?.toLocaleString()} tokens
        </span>
      )}
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

const MessageItem = ({
  message: msg,
  isStreaming,
  onEdit,
  onEditStart,
  onRetry,
  onFeedback,
  highlight,
  onCitationClick,
  onSourcesClick,
}: MessageItemProps) => {
  const { user } = useUser();
  const dbUser = useChatStore((state) => state.dbUser);
  const isUser = msg.role === "user";
  const isFailed = msg.status === "failed";
  const isEdited = Boolean(msg.role === "user" && msg.updatedAt && msg.createdAt && new Date(msg.updatedAt).getTime() - new Date(msg.createdAt).getTime() > 2000);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>(msg.attachments || []);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  // Edit-local provider & web search state
  const [editProvider, setEditProvider] = useState(getStoredProvider);
  const [editWebSearchEnabled, setEditWebSearchEnabled] = useState(false);
  const { availableProviders } = useAvailableProviders(editProvider, setEditProvider);
  const canUpload = supportsVision(editProvider);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const highlightedRef = useRef(false);
  const lastHighlightedTerm = useRef<string | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);

  const CHAR_LIMIT = 500;
  const needsToggle = msg.content.length > CHAR_LIMIT;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  useEffect(() => {
    if (!highlight) {
      highlightedRef.current = false;
      lastHighlightedTerm.current = null;
      return;
    }

    if (
      highlightedRef.current &&
      lastHighlightedTerm.current === highlight
    ) {
      return;
    }

    if (contentRef.current && !isStreaming) {
      const term = highlight.toLowerCase();

      const walker = document.createTreeWalker(
        contentRef.current,
        NodeFilter.SHOW_TEXT
      );

      let node: Node | null;
      const nodes: Text[] = [];
      let fullText = "";

      while ((node = walker.nextNode())) {
        nodes.push(node as Text);
        fullText += node.textContent || "";
      }

      const startIndex = fullText.toLowerCase().indexOf(term);

      if (startIndex !== -1) {
        const endIndex = startIndex + term.length;

        let currentPos = 0;
        let firstMark: HTMLElement | null = null;

        nodes.forEach((textNode) => {
          const nodeText = textNode.textContent || "";

          const nodeStart = currentPos;
          const nodeEnd = currentPos + nodeText.length;

          const overlapStart = Math.max(startIndex, nodeStart);
          const overlapEnd = Math.min(endIndex, nodeEnd);

          if (overlapStart < overlapEnd) {
            const relativeStart = overlapStart - nodeStart;
            const relativeEnd = overlapEnd - nodeStart;

            const before = nodeText.substring(0, relativeStart);
            const match = nodeText.substring(relativeStart, relativeEnd);
            const after = nodeText.substring(relativeEnd);

            const span = document.createElement("span");

            const mark = document.createElement("mark");

            mark.className =
              "highlight-mark bg-emerald-500/40 text-emerald-300 font-bold px-0.5 rounded ring-1 ring-emerald-500/50 animate-pulse";

            mark.textContent = match;

            span.appendChild(document.createTextNode(before));
            span.appendChild(mark);
            span.appendChild(document.createTextNode(after));

            if (!firstMark) firstMark = mark;

            textNode.parentNode?.replaceChild(span, textNode);
          }

          currentPos = nodeEnd;
        });

        if (firstMark) {
          lastHighlightedTerm.current = highlight;
          highlightedRef.current = true;

          requestAnimationFrame(() => {
            firstMark?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          });

          const timer = setTimeout(() => {
            const marks =
              contentRef.current?.querySelectorAll(".highlight-mark");

            marks?.forEach((m) => {
              m.classList.remove("animate-pulse");
              m.classList.add("bg-emerald-500/20");
            });
          }, 3000);

          return () => clearTimeout(timer);
        }
      }
    }
  }, [highlight, isStreaming]);

  const handleEditStart = () => {
    setIsEditing(true);
    setEditContent(msg.content);
    setEditProvider(getStoredProvider());
    setEditWebSearchEnabled(false);
    onEditStart?.();
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditContent(msg.content);
    setAttachments(msg.attachments || []);
    setAttachedFile(null);
  };

  // Clear attachments when switching to a non-vision model
  useEffect(() => {
    if (isEditing && !canUpload) {
      setAttachments([]);
      setAttachedFile(null);
    }
  }, [isEditing, canUpload]);

  const handleEditSave = () => {
    const contentChanged = editContent.trim() !== msg.content;
    const attachmentsChanged =
      JSON.stringify(attachments) !== JSON.stringify(msg.attachments || []);
    const hasNewFile = Boolean(attachedFile);

    if (!editContent.trim()) {
      setIsEditing(false);
      return;
    }

    if (contentChanged || attachmentsChanged || hasNewFile) {
      onEdit?.(editContent, {
        provider: editProvider,
        webSearchEnabled: editWebSearchEnabled,
        attachments,
        attachedFile,
      });
    }

    setIsEditing(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const getAttachmentIcon = (mimeType?: string) => {
    if (!mimeType) return FileIcon;
    if (mimeType.startsWith("image/")) return ImageIcon;
    if (mimeType.includes("word") || mimeType.includes("pdf")) return FileText;
    if (mimeType.includes("excel") || mimeType.includes("sheet")) return Table;
    if (mimeType.includes("powerpoint") || mimeType.includes("presentation")) return MonitorPlay;
    return FileIcon;
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
      toast.error("Unsupported file type!");
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

      setAttachments((prev) => [
        ...prev,
        { url: res.data.url, name: file.name, mimeType: file.type, size: file.size },
      ]);
      toast.success("Image uploaded");
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExpansion = () => {
    if (isExpanded) {
      setIsExpanded(false);

      requestAnimationFrame(() => {
        setTimeout(() => {
          contentRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 30);
      });
    } else {
      setIsExpanded(true);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);

    setCopied(true);

    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  let processedContent =
    !isUser && msg.content
      ? msg.content.replace(/\[(\d+)\]/g, '<cite data-id="$1"></cite>')
      : msg.content;

  if (processedContent) {
    processedContent = escapeUnrecognizedHtmlTags(processedContent);
  }

  const citationComponents = !isUser
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
      className={`group flex w-full ${isUser ? "justify-end" : "justify-start"
        }`}
    >
      <div
        className={`flex w-full gap-4 md:gap-6 ${isUser
          ? "max-w-full md:max-w-4xl flex-row-reverse"
          : "max-w-full md:max-w-5xl flex-row items-start"
          }`}
      >
        <div className="hidden xs:block">
          <MessageAvatar
            isUser={isUser}
            imageUrl={dbUser?.imageUrl || user?.imageUrl}
            failed={isFailed}
          />
        </div>

        <div
          className={`flex flex-col gap-2 ${isUser ? "items-end min-w-0 flex-1" : "min-w-0 flex-1"
            }`}
        >
          {!isFailed && (
            <div
              className={`flex items-center gap-3 ${isUser ? "flex-row-reverse" : "flex-row"
                }`}
            >
              <MessageMetadata
                isUser={isUser}
                model={msg.model}
                tokens={msg.tokens}
                isStreaming={isStreaming}
                content={msg.content}
                isEdited={isEdited}
              />
            </div>
          )}

          <div
            className={`transition-all duration-200 ease-out ${isUser
              ? `max-w-full min-w-0 overflow-hidden rounded-2xl border ${isEditing
                ? "border-white/20 bg-white/5 ring-1 ring-white/5"
                : "border-white/10 bg-white/3"
              } px-5 py-3 text-[0.95rem] md:text-base leading-relaxed text-white`
              : isFailed
                ? "w-fit max-w-full min-w-0 overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-3.5 text-base leading-[1.8] text-red-300 shadow-sm"
                : "w-full max-w-full min-w-0 overflow-hidden py-1 text-[0.95rem] md:text-base leading-relaxed text-slate-200"
              }`}
            ref={contentRef}
            key={highlight || "no-highlight"}
            data-message-role={msg.role}
            data-message-id={msg.id}
            data-message-content={msg.content}
          >
            {isStreaming && !msg.content ? (
              msg.isParsingDocument ? (
                <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                  <span className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  <span>Parsing document...</span>
                </div>
              ) : msg.isWebSearching ? (
                <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                  <Globe size={14} className="animate-pulse" />
                  <span>Searching the web...</span>
                </div>
              ) : (
                <div className="flex gap-2 py-3">
                  <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                  <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                  <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
                </div>
              )
            ) : isEditing ? (
              <div className="flex flex-col gap-3 w-full min-w-[200px] md:min-w-[400px]">
                {/* Model Selector + Web Search Toggle */}
                <div className="flex items-center gap-2 flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        {getProviderIcon(editProvider, 12)}
                        <span>{getModelOnlyName(availableProviders.find(p => p.id === editProvider)?.name || editProvider)}</span>
                        <ChevronDown size={10} className="ml-0.5 text-slate-600 transition-colors" />
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
                          onClick={() => setEditProvider(p.id)}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors ${
                            editProvider === p.id
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

                  <button
                    type="button"
                    onClick={() => setEditWebSearchEnabled(!editWebSearchEnabled)}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      editWebSearchEnabled
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-400/20"
                        : "border-white/10 bg-white/5 text-slate-500 hover:border-white/20 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Globe size={12} />
                    <span>Web Search</span>
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent border-none focus:ring-0 outline-none focus:outline-none resize-none overflow-hidden p-0 text-white placeholder-slate-500 min-h-[1.5em]"
                  rows={1}
                />

                {/* Attachment Previews */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
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
                              <Icon size={20} className="text-slate-300 shrink-0" />
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

                {/* Attached File Preview */}
                {attachedFile && (
                  <div className="flex flex-wrap gap-2 mt-2">
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

                <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <div className="flex items-center gap-2">
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
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:hover:bg-transparent"
                        aria-label="Upload file"
                      >
                        {isUploading ? (
                          <Loader2 size={16} className="animate-spin text-white" />
                        ) : (
                          <Paperclip size={16} />
                        )}
                      </button>
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
                  Server Band Hai Boss 🫡
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
                      isUser ? "break-words whitespace-pre-wrap" : ""
                    }
                  >
                    <div>
                      {isUser ? (
                        <div className="flex flex-col gap-3">
                          {msg.metadata?.selection && (
                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                              {/* Header */}
                              <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
                                <div className="h-2 w-2 rounded-full bg-indigo-400" />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  Selected text
                                </span>
                              </div>
                              {/* Selected Content */}
                              <div className="border-l-2 border-l-indigo-400 px-3 py-2">
                                <div className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                                  {
                                    (
                                      msg.metadata.selection as {
                                        selectedText?: string;
                                      }
                                    )?.selectedText
                                  }
                                </div>
                              </div>
                            </div>
                          )}
                          <div
                            className={`whitespace-pre-wrap break-words text-white relative ${
                              !isExpanded && needsToggle ? "line-clamp-10" : ""
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
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
                        onClick={handleExpansion}
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

                {isUser && (
                  <AttachmentList attachments={msg.attachments || []} />
                )}
              </>
            )}
          </div>

          {!isUser && !isStreaming && (msg.content || isFailed) && (
            <div className="flex items-center gap-1 transition-all duration-200 opacity-100">
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check size={17} className="text-emerald-500" />
                ) : (
                  <Copy size={17} />
                )}
              </button>

              <button
                onClick={() =>
                  onFeedback?.(msg.feedback === "like" ? null : "like")
                }
                className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${msg.feedback === "like"
                  ? "text-indigo-400 bg-indigo-500/10"
                  : "text-slate-500 hover:text-slate-300"
                  }`}
                title="Like"
              >
                <ThumbsUp
                  size={17}
                  fill={msg.feedback === "like" ? "currentColor" : "none"}
                />
              </button>

              <button
                onClick={() =>
                  onFeedback?.(
                    msg.feedback === "dislike" ? null : "dislike"
                  )
                }
                className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${msg.feedback === "dislike"
                  ? "text-red-400 bg-red-500/10"
                  : "text-slate-500 hover:text-slate-300"
                  }`}
                title="Dislike"
              >
                <ThumbsDown
                  size={17}
                  fill={msg.feedback === "dislike" ? "currentColor" : "none"}
                />
              </button>

              <button
                onClick={onRetry}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Regenerate response"
              >
                <RotateCcw size={17} />
              </button>

              {!!msg.sources?.length && (
                <button
                  onClick={() => {
                    if (msg.sources?.length) {
                      onSourcesClick?.(
                        msg.sources,
                        msg.sources[0]?.id
                      );
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

          {isUser && !isEditing && (
            <div className="flex items-center gap-1 opacity-100 transition-all duration-200">
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy to clipboard"
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
                title="Edit message"
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
  prev: MessageItemProps,
  next: MessageItemProps
) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.model === next.message.model &&
    prev.message.status === next.message.status &&
    prev.isStreaming === next.isStreaming &&
    prev.message.attachments === next.message.attachments &&
    prev.message.isWebSearching === next.message.isWebSearching &&
    prev.message.isParsingDocument === next.message.isParsingDocument &&
    prev.message.feedback === next.message.feedback &&
    prev.highlight === next.highlight &&
    prev.message.tokens?.completionTokens ===
    next.message.tokens?.completionTokens &&
    prev.message.sources === next.message.sources
  );
};

export default memo(MessageItem, areEqual);
