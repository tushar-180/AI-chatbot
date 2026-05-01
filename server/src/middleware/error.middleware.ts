import { Request, Response, NextFunction } from "express";
import { AIServiceError } from "../services/ai/types";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Error:", err.message || err);

  if (err instanceof AIServiceError) {
    return res.status(err.status).json({
      error: err.message,
      retryAfter: err.retryAfter,
    });
  }

  // Handle Mongoose cast errors
  if (err.name === "CastError") {
    return res.status(404).json({ error: "Resource not found" });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: message,
  });
};
