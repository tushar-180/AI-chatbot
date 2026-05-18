export type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    requestId?: string;
    status?: "streaming" | "stopped" | "completed" | "failed";
    feedback?: "like" | "dislike" | null;
    isWebSearching?: boolean;
    type?: "text" | "image" | "file" | "action";
    attachments?: {
        url: string;
        name?: string;
        mimeType?: string;
        size?: number;
    }[];
    sources?: WebSource[];
};

export type Chat = {
    _id: string;
    title: string;
    shareId?: string;
    isPublic?: boolean;
    isArchived?: boolean;
    isPinned?: boolean;
    updatedAt?: string;
};
export type StreamEventPayload = {
    chatId?: string;
    requestId?: string;
    model?: string;
    chunk?: string;
    done?: boolean;
    status?: "streaming" | "stopped" | "completed" | "failed";
    error?: string;
    messageId?: string;
};

export type WebSource = {
    id: number;
    title: string;
    hostname: string;
    url: string;
    snippet: string;
}