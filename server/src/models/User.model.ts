import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    imageUrl: {
      type: String,
    },
    lastSignInAt: {
      type: Date,
    },
    personalization: {
      customInstructions: { type: String, default: "" },
      nickname: { type: String, default: "" },
      occupation: { type: String, default: "" },
      tone: { type: String, default: "Default" },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
