import { Request, Response } from "express";
import { chatService } from "../services/chat.service";
import { chatStreamRegistry } from "../services/chatStreamRegistry.service";
import { asyncHandler } from "../utils/asyncHandler";
import { setSseHeaders, splitAndWriteChunk, writeSse } from "../utils/sse";
import type { StreamPayload } from "../types/chat.types";

const getHttpStatus = (error: unknown) => {
  if (!(error instanceof Error)) return 500;
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  if (error.name === "ForbiddenError") return 403;
  return 500;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const sendControllerError = (
  res: Response,
  error: unknown,
  fallback: string,
) => {
  const status = getHttpStatus(error);
  return res.status(status).json({ error: getErrorMessage(error, fallback) });
};

const pipeStreamResponse = async (
  req: Request,
  res: Response,
  stream: AsyncGenerator<StreamPayload>,
) => {
  const firstPayload = await stream.next();
  if (firstPayload.done) return;

  setSseHeaders(res);

  let clientDisconnected = false;
  req.on("close", () => {
    clientDisconnected = true;
  });

  const writePayload = async (payload: Awaited<typeof firstPayload>["value"]) => {
    if (clientDisconnected) return;

    if (payload.chunk) {
      await splitAndWriteChunk(res, payload.chunk, {
        requestId: payload.requestId,
        status: payload.status,
      });
    } else {
      writeSse(res, payload);
    }

    if (payload.done || payload.error) {
      res.end();
    }
  };

  await writePayload(firstPayload.value);

  for await (const payload of stream) {
    await writePayload(payload);
  }
};

export const createChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.createChat({
      ...req.body,
      userId: req.clerkId!,
    });
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to create chat");
  }
});

export const createChatStream = async (req: Request, res: Response) => {
  try {
    await pipeStreamResponse(
      req,
      res,
      chatService.createChatStream({
        ...req.body,
        userId: req.clerkId!,
      }),
    );
  } catch (error) {
    console.log("Error in createChatStream:", error);
    if (!res.headersSent) {
      sendControllerError(res, error, "Failed to create chat stream");
    } else {
      res.end();
    }
  }
};

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.sendMessage({
      chatId: String(req.params.id),
      ...req.body,
    });

    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to send message");
  }
});

export const getAllChats = asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const isArchived = req.query.isArchived === "true";
    const chats = await chatService.getAllChats(
      req.clerkId!,
      page,
      limit,
      isArchived,
    );
    return res.json(chats);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch chats");
  }
});

export const getChatById = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chatId = String(req.params.id);
    const currentUserId = req.clerkId!;

    const chat = await chatService.getChatById(chatId);

    if (!chat?.userId || chat.userId !== currentUserId) {
      return res
        .status(403)
        .json({ error: "You are not allowed to view messages for this chat." });
    }

    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch chat");
  }
});

export const streamMessage = async (req: Request, res: Response) => {
  try {
    await pipeStreamResponse(
      req,
      res,
      chatService.streamMessage({
        chatId: String(req.params.id),
        ...req.body,
      }),
    );
  } catch (error) {
    console.log("Error in streamMessage:", error);
    if (!res.headersSent) {
      sendControllerError(res, error, "Failed to initiate stream");
    } else {
      res.end();
    }
  }
};

export const stopStream = asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await chatService.stopStream(req.body);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to stop stream");
  }
});

export const deleteChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    await chatService.deleteChat(String(req.params.id));
    return res.json({ message: "Chat deleted successfully" });
  } catch (error) {
    return sendControllerError(res, error, "Failed to delete chat");
  }
});

export const updateChatTitle = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.updateChatTitle(
      String(req.params.id),
      req.body.title
    );
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to update chat title");
  }
});

export const archiveChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.archiveChat(String(req.params.id));
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to archive chat");
  }
});

export const unarchiveChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.unarchiveChat(String(req.params.id));
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to unarchive chat");
  }
});

export const pinChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.pinChat(String(req.params.id));
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to pin chat");
  }
});

export const unpinChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.unpinChat(String(req.params.id));
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to unpin chat");
  }
});

export const getGallery = asyncHandler(async (req: Request, res: Response) => {
  try {
    const gallery = await chatService.getGallery(req.clerkId!);
    return res.json(gallery);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch gallery");
  }
});

export const getStreamUpdates = async (req: Request, res: Response) => {
  const chatId = req.params.id as string;
  const activeStream = chatStreamRegistry.getByChatId(chatId);

  if (!activeStream) {
    return res
      .status(200)
      .json({ active: false, message: "No active stream found for this chat" });
  }

  setSseHeaders(res);

  writeSse(res, {
    model: activeStream.model,
    requestId: activeStream.requestId,
    status: activeStream.status,
  });
  if (activeStream.fullResponse) {
    writeSse(res, {
      chunk: activeStream.fullResponse,
      requestId: activeStream.requestId,
      status: activeStream.status,
    });
  }

  const onChunk = async (chunk: string) => {
    await splitAndWriteChunk(res, chunk, {
      requestId: activeStream.requestId,
      status: activeStream.status,
    });
  };

  const onDone = () => {
    writeSse(res, {
      done: true,
      chatId,
      requestId: activeStream.requestId,
      status: activeStream.status,
    });
    res.end();
  };

  const onError = (errorMsg: string) => {
    writeSse(res, { error: errorMsg });
    res.end();
  };

  activeStream.emitter.on("chunk", onChunk);
  activeStream.emitter.on("done", onDone);
  activeStream.emitter.on("error", onError);

  req.on("close", () => {
    activeStream.emitter.off("chunk", onChunk);
    activeStream.emitter.off("done", onDone);
    activeStream.emitter.off("error", onError);
  });
};

export const editMessage = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.editMessage({
      chatId: String(req.params.id),
      messageId: String(req.params.messageId),
      ...req.body,
    });

    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to edit message");
  }
});

export const streamEditMessage = async (req: Request, res: Response) => {
  try {
    await pipeStreamResponse(
      req,
      res,
      chatService.streamEditMessage({
        chatId: String(req.params.id),
        messageId: String(req.params.messageId),
        ...req.body,
      }),
    );
  } catch (error) {
    console.log("Error in streamEditMessage:", error);
    if (!res.headersSent) {
      sendControllerError(res, error, "Failed to initiate stream edit");
    } else {
      res.end();
    }
  }
};

export const retryMessage = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.retryMessage({
      chatId: String(req.params.id),
      messageId: String(req.params.messageId),
      ...req.body,
    });

    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to retry message");
  }
});

export const streamRetryMessage = async (req: Request, res: Response) => {
  try {
    await pipeStreamResponse(
      req,
      res,
      chatService.streamRetryMessage({
        chatId: String(req.params.id),
        messageId: String(req.params.messageId),
        ...req.body,
      }),
    );
  } catch (error) {
    console.log("Error in streamRetryMessage:", error);
    if (!res.headersSent) {
      sendControllerError(res, error, "Failed to initiate retry stream");
    } else {
      res.end();
    }
  }
};
