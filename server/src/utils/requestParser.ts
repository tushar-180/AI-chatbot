import { Request } from "express";

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
};

export const parseRequestBody = (req: Request) => {
  const attachments = typeof req.body.attachments === "string"
    ? JSON.parse(req.body.attachments)
    : (req.body.attachments || []);

  let selection = req.body.selection;
  if (selection !== undefined) {
    selection = typeof selection === "string" && selection !== "undefined"
      ? JSON.parse(selection)
      : selection;
  }

  const webSearchEnabled = parseBoolean(req.body.webSearchEnabled);
  const attachedFile = (req as any).file || null;

  return {
    attachments,
    selection,
    webSearchEnabled,
    attachedFile,
  };
};

export const resolveClerkId = (req: Request): string => {
  const userId = req.body?.userId || req.query?.userId;
  const clerkId = userId || (req as any).auth?.userId || req.headers["x-user-id"];
  if (!clerkId) {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    throw error;
  }
  return clerkId as string;
};
