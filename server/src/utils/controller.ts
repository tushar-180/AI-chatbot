import { Response } from "express";

export const getHttpStatus = (error: unknown) => {
  if (!(error instanceof Error)) return 500;
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  if (error.name === "ForbiddenError") return 403;
  if (error.name === "UnauthorizedError") return 401;
  return 500;
};

export const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

export const sendControllerError = (
  res: Response,
  error: unknown,
  fallback: string,
) => {
  const status = getHttpStatus(error);
  const message = getErrorMessage(error, fallback);

  if (status >= 500) {
    console.error(fallback, error);
  }

  return res.status(status).json({ error: message });
};

export const sendStreamControllerError = (
  res: Response,
  error: unknown,
  fallback: string,
) => {
  if (!res.headersSent) {
    return sendControllerError(res, error, fallback);
  }

  return res.end();
};
