import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "action"],
      default: "text",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    attachments: [
      {
        url: String,
        name: String,
        mimeType: String,
        size: Number,
      },
    ],
    model: {
      type: String,
    },
    requestId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ["streaming", "stopped", "completed", "failed"],
      default: "completed",
      required: true,
    },
  },
  { timestamps: true },
);

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
    },
    // We keep this for backward compatibility during transition
    // but we will mainly use the Message collection.
    legacyMessages: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true },
);

export type ChatMessage = {
  id?: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "image" | "file" | "action";
  metadata?: any;
  attachments?: {
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
  }[];
  model?: string;
  requestId?: string;
  status: "streaming" | "stopped" | "completed" | "failed";
  createdAt?: Date;
  updatedAt?: Date;
};

export const Chat = mongoose.model("Chat", chatSchema);
export const Message = mongoose.model("Message", messageSchema);
