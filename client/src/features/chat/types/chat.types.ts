export type Message = {
  role: "user" | "assistant";
  content: string;
  model?: string;
};

export type Chat = {
  _id: string;
  title: string;
};

export type StreamEventPayload = {
  chatId?: string;
  model?: string;
  chunk?: string;
  done?: boolean;
  error?: string;
};
