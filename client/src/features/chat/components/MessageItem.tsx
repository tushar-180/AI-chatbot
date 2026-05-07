import { useUser } from "@clerk/react";
import { User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  assistantMarkdownComponents,
  userMarkdownComponents,
} from "./MarkdownConfig";

interface Attachment {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  status?: "streaming" | "stopped" | "completed" | "failed";
  type?: "text" | "image" | "file" | "action";
  attachments?: Attachment[];
}

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

/**
 * Renders a list of attachments (e.g. images)
 */
const AttachmentList = ({ attachments }: { attachments: Attachment[] }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {attachments.map((attachment, index) => (
        <div key={index} className="group relative max-w-sm overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-md transition-all hover:border-white/20">
          {attachment.mimeType?.startsWith('image/') || attachment.url.startsWith('data:image') ? (
            <img 
              src={attachment.url} 
              alt={attachment.name || 'Attachment'} 
              className="h-auto w-full object-contain max-h-100"
            />
          ) : (
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <span className="text-xs font-bold uppercase tracking-tighter">File</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white truncate max-w-50">{attachment.name || 'File'}</span>
                {attachment.size && <span className="text-[10px] text-slate-400">{(attachment.size / 1024).toFixed(1)} KB</span>}
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
  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden transition-all duration-300 ${isUser ? 'border border-white/10 shadow-sm' : ''} ${failed ? 'bg-red-500/10 border-red-500/20' : ''}`}>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        ) : (
          <img src="/logo.png" alt="Velora Logo" className="h-6 w-6 object-contain" />
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
    className={`flex items-center gap-2 ${
      isUser ? "flex-row-reverse" : "flex-row"
    }`}
  >
    <span
      className={`text-[9px] font-bold uppercase tracking-[0.3em] ${
        isUser ? "text-slate-300" : "text-slate-600"
      } ${isUser ? "mr-1" : "ml-1"}`}
    >
      {isUser ? "You" : "Velora"}
    </span>
    {!isUser && model && (
      <span className="flex items-center rounded-lg border border-white/5 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        {model}
      </span>
    )}
  </div>
);

/**
 * MessageItem component
 * Renders an individual chat message with markdown support and distinctive styles for user/assistant.
 */
const MessageItem = ({ message: msg, isStreaming }: MessageItemProps) => {
  const { user } = useUser();
  const isUser = msg.role === "user";
  const isFailed = msg.status === "failed";

  return (
    <div
      className={`flex w-full ${
        !isStreaming
          ? "animate-in fade-in slide-in-from-bottom-2 duration-300"
          : ""
      } ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex w-full gap-4 md:gap-6 ${
          isUser
            ? "max-w-full md:max-w-4xl flex-row-reverse"
            : "max-w-full md:max-w-5xl flex-row items-start"
        }`}
      >
        <div className="hidden xs:block">
          <MessageAvatar isUser={isUser} imageUrl={user?.imageUrl} failed={isFailed} />
        </div>

        <div
          className={`flex flex-col gap-2 ${
            isUser ? "items-end flex-1" : "min-w-0 flex-1"
          }`}
        >
          {!isFailed && <MessageMetadata isUser={isUser} model={msg.model} />}

          <div
            className={`transition-all duration-300 ${
              isUser
                ? "max-w-full rounded-2xl border border-white/10 bg-white/3 px-5 py-3 text-[0.95rem] md:text-base leading-relaxed text-white"
                : isFailed 
                  ? "w-fit rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-[0.95rem] md:text-base leading-relaxed text-red-400"
                  : "w-full py-1 text-[0.95rem] md:text-base leading-relaxed text-slate-200"
            }`}
          >
            {isStreaming && !msg.content ? (
              <div className="flex gap-2 py-3">
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
              </div>
            ) : isFailed ? (
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-red-400/90">Server Error</span>
                <span className="text-sm opacity-80">AI failed to respond. Please try again later.</span>
              </div>
            ) : (
              <>
                {msg.content && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={
                      isUser ? userMarkdownComponents : assistantMarkdownComponents
                    }
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
                <AttachmentList attachments={msg.attachments || []} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


export default MessageItem;
