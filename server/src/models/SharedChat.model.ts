import mongoose from "mongoose";

const sharedChatSchema = new mongoose.Schema(
  {
    originalChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      unique: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    title: {
      type: String,
      default: "",
    },

    messages: [
      {
        role: {
          type: String,
          required: true,
        },

        content: {
          type: String,
          required: true,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const SharedChat = mongoose.model(
  "SharedChat",
  sharedChatSchema
);
