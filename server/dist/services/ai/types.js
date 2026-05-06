"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIServiceError = void 0;
class AIServiceError extends Error {
    constructor(message, status = 500, retryAfter) {
        super(message);
        this.name = "AIServiceError";
        this.status = status;
        this.retryAfter = retryAfter;
    }
}
exports.AIServiceError = AIServiceError;
