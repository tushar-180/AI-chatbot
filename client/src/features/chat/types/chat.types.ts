export type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    requestId?: string;
    status?: "streaming" | "stopped" | "completed" | "failed";
    feedback?: "like" | "dislike" | null;
    isWebSearching?: boolean;
    isParsingDocument?: boolean;
    type?: "text" | "image" | "file" | "action";
    attachments?: Attachment[];
    tokens?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    sources?: WebSource[];
    metadata?: {
        selection?: {
            selectedText: string;
            originalSourceMessage: string;
            sourceMessageId: string;
            actionType: string;
        };
    };
    createdAt?: string;
    updatedAt?: string;
};

export type Chat = {
    _id: string;
    title: string;
    shareId?: string;
    isPublic?: boolean;
    isArchived?: boolean;
    isPinned?: boolean;
    projectId?: string | null;
    updatedAt?: string;
};
export type StreamEventPayload = {
    type?: "message" | "sources";
    chatId?: string;
    requestId?: string;
    model?: string;
    chunk?: string;
    done?: boolean;
    status?: "streaming" | "stopped" | "completed" | "failed";
    error?: string;
    messageId?: string;
    sources?: WebSource[];
};

export type WebSource = {
    id: number;
    title: string;
    hostname: string;
    url: string;
    snippet: string;
}

export interface Attachment {
    url?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    isDocument?: boolean;
}