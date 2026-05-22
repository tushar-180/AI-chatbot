import { memo, useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useChatStore } from "@/features/chat/store/useChatStore";
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
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import { assistantMarkdownComponents } from "./MarkdownConfig";

import type { GroupMessage } from "../store/useGroupStore";

interface GroupMessageItemProps {
  message: GroupMessage;

  onCitationClick?: (id: number) => void;
  onSourcesClick?: (sources: any[], activeId?: number) => void;

  onEdit?: (content: string) => void;
  onEditStart?: () => void;

  onRetry?: () => void;

  onFeedback?: (feedback: "like" | "dislike" | null) => void;
}

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
        <img src={imageUrl} alt="User" className="h-full w-full object-cover" />
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

  const isAssistant = msg.role === "assistant" || msg.userId === "velora";
  const isMe = msg.userId === user?.id && !isAssistant;
  const isSystem = msg.role === "system";
  const isUser = msg.role === "user";

  const isFailed = msg.status === "failed";

  const [isExpanded, setIsExpanded] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const CHAR_LIMIT = 500;
  const needsToggle = msg.content.length > CHAR_LIMIT;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);
  const messageRef = useRef<HTMLDivElement>(null);

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
      return <span className="text-emerald-400 ">You</span>;
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

        return (
          (hasLeadingSpace ? " " : "") +
          `<span class="text-emerald-400 font-medium">${mentionText}</span>`
        );
      },
    );
  }

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
                ? "w-fit max-w-full min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5 text-base leading-[1.8] tracking-[0.01em] text-white shadow-sm"
                : isFailed
                  ? "w-fit max-w-full min-w-0 overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-3.5 text-base leading-[1.8] text-red-300 shadow-sm"
                  : isAssistant
                    ? "w-full max-w-full min-w-0 overflow-hidden py-1 text-base leading-[1.8] text-slate-200"
                    : "w-fit max-w-full min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5 text-base leading-[1.8] tracking-[0.01em] text-white shadow-sm"
            }`}
          >
            {isEditing ? (
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

                <AttachmentList attachments={msg.attachments || []} />

                {isAssistant && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (msg.sources?.length) {
                          onSourcesClick?.(msg.sources, msg.sources[0]?.id);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg hover:bg-slate-800 bg-slate-900 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Sources
                    </button>
                  </div>
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

              <button
                onClick={() =>
                  onFeedback?.(msg.feedback === "like" ? null : "like")
                }
                className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${
                  msg.feedback === "like"
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
                  onFeedback?.(msg.feedback === "dislike" ? null : "dislike")
                }
                className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${
                  msg.feedback === "dislike"
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
                title="Retry"
              >
                <RotateCcw size={17} />
              </button>
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
    prev.message.feedback === next.message.feedback &&
    prev.message.username === next.message.username &&
    prev.message.userImage === next.message.userImage &&
    prev.message.attachments === next.message.attachments &&
    prev.message.sources === next.message.sources &&
    prev.message.metadata?.webSearchEnabled === next.message.metadata?.webSearchEnabled
  );
};

export default memo(GroupMessageItem, areEqual);
