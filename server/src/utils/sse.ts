import type { Response } from "express";

export const setSseHeaders = (res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.socket?.setNoDelay(true);
  res.flushHeaders?.();
};

export const writeSse = (res: Response, payload: unknown) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if ((res as any).flush) {
    (res as any).flush();
  }
};

export const endSse = (res: Response, payload?: unknown) => {
  if (payload) {
    writeSse(res, payload);
  }
  // Small delay to ensure the OS/proxy flushes the last chunk before closing
  setTimeout(() => {
    if (!res.writableEnded) {
      res.end();
    }
  }, 100);
};

export const splitAndWriteChunk = async (
  res: Response,
  chunk: string,
  meta: Record<string, unknown> = {},
) => {
  if (chunk.length > 25) {
    const parts = chunk.split(/(\s+)/);

    for (const part of parts) {
      if (part) {
        writeSse(res, { ...meta, chunk: part });
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }

    return;
  }

  writeSse(res, { ...meta, chunk });
};
