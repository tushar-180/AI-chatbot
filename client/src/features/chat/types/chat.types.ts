export type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    requestId?: string;
    status?: "streaming" | "stopped" | "completed" | "failed";
    isWebSearching?: boolean;
    type?: "text" | "image" | "file" | "action";
    attachments?: {
        url: string;
        name?: string;
        mimeType?: string;
        size?: number;
    }[];
};

export type Chat = {
    _id: string;
    title: string;
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
};
