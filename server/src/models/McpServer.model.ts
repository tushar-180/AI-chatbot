import mongoose from "mongoose";

const mcpServerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["stdio", "sse"],
    },
    command: {
      type: String,
      required: function (this: any) {
        return this.type === "stdio";
      },
      trim: true,
    },
    args: {
      type: [String],
      default: [],
    },
    url: {
      type: String,
      required: function (this: any) {
        return this.type === "sse";
      },
      trim: true,
    },
    env: {
      type: Map,
      of: String,
      default: {},
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const McpServer = mongoose.model("McpServer", mcpServerSchema);
