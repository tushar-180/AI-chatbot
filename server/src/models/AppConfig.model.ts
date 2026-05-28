import mongoose, { Document, Schema } from "mongoose";

export interface IAppConfig extends Document {
  singletonId: string;
  disabledProviders: string[];
  disabledModels: string[];
}

const AppConfigSchema: Schema = new Schema(
  {
    singletonId: { type: String, required: true, unique: true, default: "global" },
    disabledProviders: { type: [String], default: [] },
    disabledModels: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const AppConfig = mongoose.model<IAppConfig>("AppConfig", AppConfigSchema);
