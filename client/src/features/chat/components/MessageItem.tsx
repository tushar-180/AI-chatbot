import { useUser } from "@clerk/react";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  assistantMarkdownComponents,
  userMarkdownComponents,
} from "./MarkdownConfig";

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

/**
 * Avatar component for the message
 */
const MessageAvatar = ({
  isUser,
  imageUrl,
}: {
  isUser: boolean;
  imageUrl?: string;
}) => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-white/10 shadow-sm transition-all duration-300">
    {isUser ? (
      imageUrl ? (
        <img src={imageUrl} alt="User" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-slate-500">
          <User size={16} />
        </div>
      )
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-white text-black">
        <Bot size={16} />
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
          <MessageAvatar isUser={isUser} imageUrl={user?.imageUrl} />
        </div>

        <div
          className={`flex flex-col gap-2 ${
            isUser ? "items-end flex-1" : "min-w-0 flex-1"
          }`}
        >
          <MessageMetadata isUser={isUser} model={msg.model} />

          <div
            className={`transition-all duration-300 ${
              isUser
                ? "max-w-full rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-[0.95rem] md:text-base leading-relaxed text-white"
                : "w-full py-1 text-[0.95rem] md:text-base leading-relaxed text-slate-200"
            }`}
          >
            {isStreaming && !msg.content ? (
              <div className="flex gap-2 py-3">
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={
                  isUser ? userMarkdownComponents : assistantMarkdownComponents
                }
              >
                {msg.content}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
