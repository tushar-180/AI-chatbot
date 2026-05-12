"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatStreamRegistry = void 0;
const events_1 = require("events");
const activeStreams = new Map();
const activeChatRequests = new Map();
exports.chatStreamRegistry = {
    create({ requestId, chatId, messageId, model, }) {
        const activeStream = {
            requestId,
            chatId,
            messageId,
            fullResponse: "",
            emitter: new events_1.EventEmitter(),
            model,
            status: "streaming",
            abortController: new AbortController(),
        };
        activeStreams.set(requestId, activeStream);
        activeChatRequests.set(chatId, requestId);
        return activeStream;
    },
    get(requestId) {
        return activeStreams.get(requestId);
    },
    getByChatId(chatId) {
        const requestId = activeChatRequests.get(chatId);
        return requestId ? activeStreams.get(requestId) : undefined;
    },
    updateResponse(requestId, fullResponse, chunk) {
        const activeStream = activeStreams.get(requestId);
        if (!activeStream)
            return;
        activeStream.fullResponse = fullResponse;
        activeStream.status = "streaming";
        activeStream.emitter.emit("chunk", chunk);
    },
    complete(requestId) {
        const activeStream = activeStreams.get(requestId);
        if (!activeStream)
            return;
        activeStream.status = "completed";
        activeStream.emitter.emit("done");
        activeStreams.delete(requestId);
        activeChatRequests.delete(activeStream.chatId);
    },
    stop(requestId) {
        const activeStream = activeStreams.get(requestId);
        if (!activeStream)
            return null;
        activeStream.status = "stopped";
        activeStream.abortController.abort();
        activeStream.emitter.emit("done");
        activeStreams.delete(requestId);
        activeChatRequests.delete(activeStream.chatId);
        return activeStream;
    },
    fail(requestId, message) {
        const activeStream = activeStreams.get(requestId);
        if (!activeStream)
            return;
        if (activeStream.emitter.listenerCount("error") > 0) {
            activeStream.emitter.emit("error", message);
        }
        activeStreams.delete(requestId);
        activeChatRequests.delete(activeStream.chatId);
    },
};
