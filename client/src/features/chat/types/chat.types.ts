export type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  requestId?: string;
  status?: "streaming" | "stopped" | "completed";
};

export type Chat = {
  _id: string;
  title: string;
};

export type StreamEventPayload = {
  chatId?: string;
  requestId?: string;
  model?: string;
  chunk?: string;
  done?: boolean;
  status?: "streaming" | "stopped" | "completed";
  error?: string;
};
