import { Request, Response } from "express";
import { chatService } from "../services/chat.service";
import { chatStreamRegistry } from "../services/chatStreamRegistry.service";
import { asyncHandler } from "../utils/asyncHandler";
import { setSseHeaders, splitAndWriteChunk, writeSse } from "../utils/sse";

const getHttpStatus = (error: unknown) => {
  if (!(error instanceof Error)) return 500;
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
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
  stream: AsyncGenerator<{
    chatId?: string;
    model?: string;
    chunk?: string;
    done?: boolean;
    error?: string;
  }>,
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
      await splitAndWriteChunk(res, payload.chunk);
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
    const chat = await chatService.createChat(req.body);
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to create chat");
  }
});

export const createChatStream = async (req: Request, res: Response) => {
  try {
    await pipeStreamResponse(req, res, chatService.createChatStream(req.body));
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
    const chats = await chatService.getAllChats(req.query.userId as string);
    return res.json(chats);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch chats");
  }
});

export const getChatById = asyncHandler(async (req: Request, res: Response) => {
  try {
    const chat = await chatService.getChatById(String(req.params.id));
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

export const getStreamUpdates = async (req: Request, res: Response) => {
  const chatId = req.params.id as string;
  const activeStream = chatStreamRegistry.get(chatId);

  if (!activeStream) {
    return res
      .status(200)
      .json({ active: false, message: "No active stream found for this chat" });
  }

  setSseHeaders(res);

  writeSse(res, { model: activeStream.model });
  if (activeStream.fullResponse) {
    writeSse(res, { chunk: activeStream.fullResponse });
  }

  const onChunk = async (chunk: string) => {
    await splitAndWriteChunk(res, chunk);
  };

  const onDone = () => {
    writeSse(res, { done: true, chatId });
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
