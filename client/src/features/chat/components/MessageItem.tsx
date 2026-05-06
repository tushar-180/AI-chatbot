import { useUser } from "@clerk/react";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo, useState } from "react";
import {
    assistantMarkdownComponents,
    userMarkdownComponents,
} from "./MarkdownConfig";
import type { Message } from "@/features/chat/types/chat.types";

interface Attachment {
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
}

interface MessageItemProps {
    message: Message;
}

/**
 * Renders attachments
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
                            className="h-auto w-full object-contain max-h-[400px]"
                        />
                    ) : (
                        <div className="flex items-center gap-3 p-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                                <span className="text-xs font-bold uppercase tracking-tighter">
                                    File
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-white truncate max-w-[200px]">
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

const MessageAvatar = ({
    isUser,
    imageUrl,
}: {
    isUser: boolean;
    imageUrl?: string;
}) => (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-white/10 shadow-sm">
        {isUser ? (
            imageUrl ? (
                <img
                    src={imageUrl}
                    alt="User"
                    className="h-full w-full object-cover"
                />
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

const MessageItem = memo(({ message: msg }: MessageItemProps) => {
    const { user } = useUser();
    const isUser = msg.role === "user";
    const isStreaming = msg.status === "streaming";

    // ✅ Track initial status to prevent re-triggering animations when streaming ends
    const [initialStatus] = useState(msg.status);
    const shouldAnimate = isUser || (msg.status === "completed" && initialStatus === "completed");

    return (
        <div
            className={`flex w-full ${
                shouldAnimate
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
                        ) : msg.status === "failed" ? (
                            <div className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-200/80">
                                <div className="flex items-center gap-2 font-medium text-red-400">
                                    <span className="text-sm">⚠️ Failed to generate response</span>
                                </div>
                                <p className="text-xs opacity-80">
                                    The AI provider encountered an error. Please try again or switch to another model.
                                </p>
                            </div>
                        ) : (
                            <>
                                {msg.content && (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
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
}, (prev, next) => {
    return (
        prev.message.id === next.message.id &&
        prev.message.content === next.message.content &&
        prev.message.status === next.message.status &&
        prev.message.model === next.message.model &&
        prev.message.attachments?.length === next.message.attachments?.length
    );
});

export default MessageItem;
