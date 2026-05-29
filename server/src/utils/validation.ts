export const requireUserId = (userId?: string) => {
  if (!userId) {
    const error = new Error("userId is required");
    error.name = "ValidationError";
    throw error;
  }

  return userId;
};

export const requireMessage = (
  message?: string,
  messageText = "message is required",
) => {
  const trimmedMessage = message?.trim();

  if (!trimmedMessage) {
    const error = new Error(messageText);
    error.name = "ValidationError";
    throw error;
  }

  return trimmedMessage;
};

export const requireRequestId = (requestId?: string) => {
  if (!requestId) {
    const error = new Error("requestId is required");
    error.name = "ValidationError";
    throw error;
  }

  return requestId;
};
