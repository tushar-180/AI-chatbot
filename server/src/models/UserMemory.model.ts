import mongoose from "mongoose";

const userMemorySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["preference", "personal", "technical", "work", "general"],
      default: "general",
    },
    importance: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    embedding: {
      type: [Number],
      index: false, // Vector indexes are created via Atlas UI/API, not standard Mongoose index
    },
  },
  { timestamps: true }
);

export const UserMemory = mongoose.model("UserMemory", userMemorySchema);
