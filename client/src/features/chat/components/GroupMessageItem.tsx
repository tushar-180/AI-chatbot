import { memo } from "react";
import { useUser } from "@clerk/react";
import { AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  assistantMarkdownComponents,
  userMarkdownComponents,
} from "./MarkdownConfig";
import type { GroupMessage } from "../store/useGroupStore";

interface GroupMessageItemProps {
  message: GroupMessage;
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
    className={`flex shrink-0 items-center justify-center rounded-lg overflow-hidden transition-all duration-300 ${
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
    ) : (
      failed ? (
        <AlertCircle className="h-4 w-4 text-red-400" />
      ) : (
        <img
          src="/logo.png"
          alt="Velora Logo"
          className="h-full w-full object-contain"
        />
      )
    )}
  </div>
);

const GroupMessageItem = ({ message: msg }: GroupMessageItemProps) => {
  const { user } = useUser();
  
  // Robust check for AI vs User
  const isAssistant = msg.role === "assistant" || msg.userId === "velora";
  const isMe = msg.userId === user?.id && !isAssistant;
  const isSystem = msg.role === "system";
  const isFailed = msg.status === "failed";

  if (isSystem) {
    return (
      <div className="flex justify-center my-6">
        <span className="px-4 py-1.5 rounded-full bg-white/[0.03] text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 border border-white/[0.05] backdrop-blur-sm">
          {msg.content}
        </span>
      </div>
    );
  }

  // Use either the image from Clerk (if it's me) or from the message (if it's someone else)
  const displayImageUrl = isMe ? user?.imageUrl : msg.userImage;

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
    if (isMe) return <span className="text-emerald-400">You</span>;
    const name = msg.username || "Velora";

    const match = name.match(/^Velora \(([^)]+)\)$/i);
    if (match) {
      const model = match[1];
      return (
        <span className="flex items-center gap-2">
          <span className="text-slate-300 font-bold tracking-[0.18em]">Velora</span>
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

  return (
    <div className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex w-fit gap-4 ${
          isMe
            ? "max-w-full md:max-w-4xl flex-row-reverse"
            : "max-w-full md:max-w-5xl flex-row items-start"
        }`}
      >
        <div
          className={`flex flex-col gap-2 ${
            isMe ? "items-end" : "items-start"
          }`}
        >
          {/* Header with Icon and Name */}
          <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
            <MessageAvatar
              isUser={!isAssistant}
              imageUrl={displayImageUrl}
              username={msg.username}
              failed={isFailed}
              size={16}
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              {renderUsername()}
            </span>
          </div>

          {/* Message Bubble */}
          <div
            className={`transition-opacity duration-150 ease-out ${
              isMe
                ? "w-fit rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5 text-base leading-[1.8] tracking-[0.01em] text-white shadow-sm"
                : isFailed
                  ? "w-fit rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-3.5 text-base leading-[1.8] text-red-300 shadow-sm"
                : isAssistant 
                  ? "w-full py-1 text-base leading-[1.8] text-slate-200"
                  : "w-fit rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5 text-base leading-[1.8] tracking-[0.01em] text-white shadow-sm"
            }`}
          >
            {isFailed ? (
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-red-300">
                  AI Response Failed
                </span>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={assistantMarkdownComponents}
                >
                  {msg.content || "The AI model failed to respond. Please try again."}
                </ReactMarkdown>
              </div>
            ) : (
              <>
                {!isAssistant && msg.metadata?.webSearchEnabled && (
                  <div className="mb-2 flex items-center justify-start">
                    <span className="flex items-center rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      web search
                    </span>
                  </div>
                )}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={
                    isAssistant
                      ? assistantMarkdownComponents
                      : userMarkdownComponents
                  }
                >
                  {(msg.content || "").replace(/(?:^|\s)@([a-zA-Z0-9-:_/.]+)/g, (match) => {
                    const hasLeadingSpace = match.startsWith(" ") || match.startsWith("\n") || match.startsWith("\r");
                  const mentionText = match.trim();
                  return (hasLeadingSpace ? " " : "") + `<span class="text-emerald-400 font-medium">${mentionText}</span>`;
                })}
              </ReactMarkdown>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(GroupMessageItem);
