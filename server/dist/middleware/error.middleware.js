"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const types_1 = require("../services/ai/types");
const errorHandler = (err, req, res, next) => {
    console.error("Error:", err.message || err);
    if (err instanceof types_1.AIServiceError) {
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
exports.errorHandler = errorHandler;
