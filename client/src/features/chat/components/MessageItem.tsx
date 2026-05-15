import { memo, useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/react";
import { User, Globe, Pencil, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  assistantMarkdownComponents,
  userMarkdownComponents,
} from "./MarkdownConfig";
import { formatModelName } from "../constants/chat.constants";

interface Attachment {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  status?: "streaming" | "stopped" | "completed" | "failed";
  type?: "text" | "image" | "file" | "action";
  attachments?: Attachment[];
  isWebSearching?: boolean;
}

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  isAnyStreaming?: boolean;
  onEdit?: (content: string) => void;
  onEditStart?: () => void;
  highlight?: string;
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
          attachment.url.startsWith("data:image") ? (
            <img
              src={attachment.url}
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
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl overflow-hidden transition-all duration-300 ${isUser ? "border border-white/[0.08] shadow-sm" : ""} ${failed ? "bg-red-500/10 border-red-500/20" : ""}`}
  >
    {isUser ? (
      imageUrl ? (
        <img src={imageUrl} alt="User" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-slate-500">
          <User size={16} />
        </div>
      )
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        {failed ? (
          <div className="text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
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
}: {
  isUser: boolean;
  model?: string;
}) => (
  <div
    className={`flex items-center gap-2.5 ${
      isUser ? "flex-row-reverse" : "flex-row"
    }`}
  >
    <span
      className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
        isUser ? "text-slate-400" : "text-slate-500"
      } ${isUser ? "mr-0.5" : "ml-0.5"}`}
    >
      {isUser ? "You" : "Velora"}
    </span>
    {!isUser && model && (
      <span className="flex items-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
        {formatModelName(model)}
      </span>
    )}
  </div>
);

/**
 * MessageItem component
 * Renders an individual chat message with markdown support and distinctive styles for user/assistant.
 */
const MessageItem = ({ message: msg, isStreaming, onEdit, onEditStart, highlight }: MessageItemProps) => {
    const { user } = useUser();
    const isUser = msg.role === "user";
    const isFailed = msg.status === "failed";

    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(msg.content);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const highlightedRef = useRef(false);
    const lastHighlightedTerm = useRef<string | null>(null);

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

        // If we already highlighted this exact term for this message, skip
        if (highlightedRef.current && lastHighlightedTerm.current === highlight) {
            return;
        }

        if (contentRef.current && !isStreaming) {
            const term = highlight.toLowerCase();
            const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
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

                    // Check if this node overlaps with the search term
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
                        mark.className = "highlight-mark bg-emerald-500/40 text-emerald-300 font-bold px-0.5 rounded ring-1 ring-emerald-500/50 animate-pulse";
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

                    // Use requestAnimationFrame for smoother and more reliable scrolling
                    requestAnimationFrame(() => {
                        if (firstMark) {
                            firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                    });

                    // Stop pulsing after 3s
                    const timer = setTimeout(() => {
                        const marks = contentRef.current?.querySelectorAll(".highlight-mark");
                        marks?.forEach(m => {
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
        onEditStart?.();
    };

    const handleEditCancel = () => {
        setIsEditing(false);
        setEditContent(msg.content);
    };

    const handleEditSave = () => {
        if (editContent.trim() && editContent !== msg.content) {
            onEdit?.(editContent);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleEditSave();
        } else if (e.key === "Escape") {
            handleEditCancel();
        }
    };

    return (
        <div
            className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
        >
            <div
                className={`flex w-full gap-4 md:gap-6 ${
                    isUser
                        ? "max-w-full md:max-w-4xl flex-row-reverse"
                        : "max-w-full md:max-w-5xl flex-row items-start"
                }`}
            >
                <div className="hidden xs:block">
                    <MessageAvatar
                        isUser={isUser}
                        imageUrl={user?.imageUrl}
                        failed={isFailed}
                    />
                </div>

                <div
                    className={`flex flex-col gap-2 ${
                        isUser ? "items-end flex-1" : "min-w-0 flex-1"
                    }`}
                >
                    {!isFailed && (
                        <div className={`flex items-center gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                            <MessageMetadata isUser={isUser} model={msg.model} />
                            
                            {isUser && !isEditing && (
                                <button
                                    onClick={handleEditStart}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white"
                                    title="Edit message"
                                >
                                    <Pencil size={12} />
                                </button>
                            )}
                        </div>
                    )}

                    <div
                        className={`transition-all duration-200 ease-out ${
                            isUser
                                ? `max-w-full rounded-2xl border ${isEditing ? "border-white/20 bg-white/5 ring-1 ring-white/5" : "border-white/10 bg-white/3"} px-5 py-3 text-[0.95rem] md:text-base leading-relaxed text-white`
                                : isFailed
                                  ? "w-fit rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-[0.95rem] md:text-base leading-relaxed text-red-400"
                                  : "w-full py-1 text-[0.95rem] md:text-base leading-relaxed text-slate-200"
                        }`}
                        ref={contentRef}
                        key={highlight || "no-highlight"}
                    >
                        {isStreaming && !msg.content ? (
                            msg.isWebSearching ? (
                                <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                                    <Globe
                                        size={14}
                                        className="animate-pulse"
                                    />
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
                        ) : isFailed ? (
                            <div className="flex flex-col gap-1">
                                <span className="font-semibold text-red-400/90">
                                    Server Error
                                </span>
                                <span className="text-sm opacity-80">
                                    {msg.content ||
                                        "AI failed to respond. Please try again later."}
                                </span>
                            </div>
                        ) : (
                            <>
                                {msg.content && (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        components={
                                            isUser
                                                ? userMarkdownComponents
                                                : assistantMarkdownComponents
                                        }
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                )}
                                <AttachmentList
                                    attachments={msg.attachments || []}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const areEqual = (prev: MessageItemProps, next: MessageItemProps) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.model === next.message.model &&
    prev.message.status === next.message.status &&
    prev.isStreaming === next.isStreaming &&
    prev.message.attachments === next.message.attachments &&
    prev.message.isWebSearching === next.message.isWebSearching &&
    prev.highlight === next.highlight
  );
};

export default memo(MessageItem, areEqual);
