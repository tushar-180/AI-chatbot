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
  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-slate-700 shadow-sm">
    {isUser ? (
      imageUrl ? (
        <img src={imageUrl} alt="User" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-400">
          <User size={18} />
        </div>
      )
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-indigo-600/20 text-indigo-400">
        <Bot size={18} />
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
      className={`text-[10px] uppercase tracking-[0.22em] text-slate-500 ${
        isUser ? "mr-1" : "ml-1"
      }`}
    >
      {isUser ? "You" : "Assistant"}
    </span>
    {!isUser && model && (
      <span className="flex items-center rounded-full border border-slate-700/70 bg-slate-900/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
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
        className={`flex w-full gap-2.5 md:gap-4 ${
          isUser
            ? "max-w-full md:max-w-3xl flex-row-reverse"
            : "max-w-full md:max-w-5xl flex-row items-start"
        }`}
      >
        <div className="hidden xs:block">
          <MessageAvatar isUser={isUser} imageUrl={user?.imageUrl} />
        </div>

        <div
          className={`flex flex-col gap-1.5 md:gap-2 ${
            isUser ? "items-end flex-1" : "min-w-0 flex-1"
          }`}
        >
          <div
            className={`transition-all duration-300 ${
              isUser
                ? "max-w-[92%] md:max-w-[85%] rounded-[1.4rem] md:rounded-[1.6rem] rounded-br-md bg-linear-to-br from-indigo-500 to-indigo-600 px-4 md:px-5 py-2.5 md:py-3.5 text-[0.9rem] md:text-[0.95rem] leading-6 md:leading-7 text-white shadow-[0_12px_30px_rgba(79,70,229,0.2)] ring-1 ring-indigo-400/30"
                : `w-full rounded-3xl md:rounded-[1.8rem] border border-slate-800/80 bg-slate-900/55 px-4 md:px-6 py-3.5 md:py-5 text-[0.9rem] md:text-slate-100 shadow-[0_20px_50px_rgba(15,23,42,0.24)] backdrop-blur-xl ${
                    isStreaming
                      ? "ring-1 ring-indigo-500/30 shadow-[0_0_25px_rgba(79,70,229,0.1)] streaming-message"
                      : ""
                  }`
            }`}
          >
            {isStreaming && !msg.content ? (
              <p>&nbsp;</p>
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

          <MessageMetadata isUser={isUser} model={msg.model} />
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
