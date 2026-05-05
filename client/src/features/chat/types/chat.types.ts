export type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  requestId?: string;
  status?: "streaming" | "stopped" | "completed" | "failed";
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
