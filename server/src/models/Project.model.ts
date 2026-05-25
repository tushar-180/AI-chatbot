import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    instructions: {
      type: String,
      default: "",
    },
    memory: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export const Project = mongoose.model("Project", projectSchema);