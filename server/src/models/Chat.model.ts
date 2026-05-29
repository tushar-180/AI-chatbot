import mongoose from "mongoose";
import { attachmentSchema } from "./schemas/attachment.schema";
import type { TokenUsage } from "../types/token.types";

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
    attachments: [attachmentSchema],
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
    // ── Branching / versioning fields ──────────────────────────────────────
    // parentId: the user-message that triggered this assistant response.
    // On retry the same parentId is reused; on edit a new user msg is created
    // and becomes the parentId of the new assistant response.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    // retryOf: points to the previous assistant message being re-generated.
    retryOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    // editedFrom: points to the original user message that this edit branched from.
    editedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    // branchId: groups all retry/edit siblings under one identifier (UUID string).
    // All generations that share the same parent user message get the same branchId.
    branchId: {
      type: String,
      default: null,
      index: true,
    },
    // version: 1-based counter within a branchId group (1 = original, 2 = first retry, …).
    version: {
      type: Number,
      default: 1,
    },
    // isActive: only the "active" sibling in a branchId group is shown by default.
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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
    isSidebarVisible: {
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



export const Chat = mongoose.model("Chat", chatSchema);
export const Message = mongoose.model("Message", messageSchema);

const tokenUsageRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Optional — not set for compare-mode records (no Chat document is created)
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: false,
      index: true,
    },
    // Optional — not set for compare-mode records (no Message document is created)
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: false,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    model: {
      type: String,
      index: true,
    },
    // 'chat' = regular conversation message, 'compare' = arena comparison (no chat/message stored)
    source: {
      type: String,
      enum: ["chat", "compare"],
      default: "chat",
      index: true,
    },
    tokens: {
      type: tokenUsageSchema,
      required: true,
    },
  },
  { timestamps: true }
);

export const TokenUsageRecord = mongoose.model("TokenUsageRecord", tokenUsageRecordSchema);

