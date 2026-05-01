"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatStreamRegistry = void 0;
const events_1 = require("events");
const activeStreams = new Map();
exports.chatStreamRegistry = {
    create(chatId, model) {
        const activeStream = {
            chatId,
            fullResponse: "",
            emitter: new events_1.EventEmitter(),
            model,
        };
        activeStreams.set(chatId, activeStream);
        return activeStream;
    },
    get(chatId) {
        return activeStreams.get(chatId);
    },
    updateResponse(chatId, fullResponse, chunk) {
        const activeStream = activeStreams.get(chatId);
        if (!activeStream)
            return;
        activeStream.fullResponse = fullResponse;
        activeStream.emitter.emit("chunk", chunk);
    },
    complete(chatId) {
        const activeStream = activeStreams.get(chatId);
        if (!activeStream)
            return;
        activeStream.emitter.emit("done");
        activeStreams.delete(chatId);
    },
    fail(chatId, message) {
        const activeStream = activeStreams.get(chatId);
        if (!activeStream)
            return;
        activeStream.emitter.emit("error", message);
        activeStreams.delete(chatId);
    },
};
