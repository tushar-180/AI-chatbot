import mongoose from "mongoose";
import { TokenUsage } from "../utils/tokenCounter";

const tokenUsageSchema = new mongoose.Schema(
  {
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
  },
  { _id: false }
);

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
        storagePath: String,
        fileHash: String,
        localPath: String,
      },
    ],
    model: {
      type: String,
      index: true,
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
    feedback: {
      type: String,
      enum: ["like", "dislike", null],
      default: null,
    },
    tokens: {
      type: tokenUsageSchema,
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
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
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
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    tokens: {
      type: tokenUsageSchema,
      default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
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
    storagePath: string;
    fileHash: string;
    localPath?: string;
  }[];
  model?: string;
  requestId?: string;
  status: "streaming" | "stopped" | "completed" | "failed";
  feedback?: "like" | "dislike" | null;
  tokens?: TokenUsage;
  createdAt?: Date;
  updatedAt?: Date;
};

export const Chat = mongoose.model("Chat", chatSchema);
export const Message = mongoose.model("Message", messageSchema);

