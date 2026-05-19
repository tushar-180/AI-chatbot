import mongoose from "mongoose";

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupChat",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    userImage: {
      type: String,
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
    status: {
      type: String,
      enum: ["streaming", "stopped", "completed", "failed"],
      default: "completed",
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "action", "event"],
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
  },
  { timestamps: true },
);

const groupChatSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "New Group Chat",
    },
    creatorId: {
      type: String,
      required: true,
    },
    members: [
      {
        userId: { type: String, required: true },
        username: { type: String, required: true },
        userImage: { type: String },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    originalChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const GroupChat = mongoose.model("GroupChat", groupChatSchema);
export const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);
