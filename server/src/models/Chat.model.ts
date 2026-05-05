import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString(),
  },
  role: {
    type: String,
    enum: ["user", "assistant"],
    required: true,
  },
  content: {
    type: String,
    default: "",
  },
  model: {
    type: String,
  },
  requestId: {
    type: String,
  },
  status: {
    type: String,
    enum: ["streaming", "stopped", "completed"],
    default: "completed",
    required: true,
  },
});

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
    messages: [messageSchema],
  },
  { timestamps: true }
);

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  requestId?: string;
  status: "streaming" | "stopped" | "completed";
};

export const Chat = mongoose.model("Chat", chatSchema);
