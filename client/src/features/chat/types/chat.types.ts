export type MessageStatus = "streaming" | "stopped" | "completed" | "failed";

export type MessageType = "text" | "image" | "file" | "action";

export type Attachment = {
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
};

export type Message = {
    id: string; // ✅ required (no optional IDs)
    chatId: string; // ✅ required for correct scoping

    role: "user" | "assistant";
    content: string;

    model?: string;
    requestId?: string;

    status: MessageStatus; // ✅ required (no undefined state)

    type?: MessageType;
    attachments?: Attachment[];
};

export type Chat = {
    _id: string;
    title: string;
    updatedAt?: string;
};

/**
 * Stream payload coming from SSE
 *
 * Notes:
 * - chatId may be undefined initially (new chat creation)
 * - becomes defined once backend resolves chat
 */
export type StreamEventPayload = {
    chatId?: string; // remains optional for new-chat flow
    requestId: string; // ✅ REQUIRED (critical for stream identity)

    model?: string;

    chunk?: string;

    done?: boolean;
    status?: MessageStatus;

    error?: string;
};
