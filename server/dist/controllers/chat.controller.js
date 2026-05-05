"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStreamUpdates = exports.updateChatTitle = exports.deleteChat = exports.stopStream = exports.streamMessage = exports.getChatById = exports.getAllChats = exports.sendMessage = exports.createChatStream = exports.createChat = void 0;
const chat_service_1 = require("../services/chat.service");
const chatStreamRegistry_service_1 = require("../services/chatStreamRegistry.service");
const asyncHandler_1 = require("../utils/asyncHandler");
const sse_1 = require("../utils/sse");
const getHttpStatus = (error) => {
    if (!(error instanceof Error))
        return 500;
    if (error.name === "ValidationError")
        return 400;
    if (error.name === "NotFoundError")
        return 404;
    return 500;
};
const getErrorMessage = (error, fallback) => {
    return error instanceof Error ? error.message : fallback;
};
const sendControllerError = (res, error, fallback) => {
    const status = getHttpStatus(error);
    return res.status(status).json({ error: getErrorMessage(error, fallback) });
};
const pipeStreamResponse = (req, res, stream) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, stream_1, stream_1_1;
    var _b, e_1, _c, _d;
    const firstPayload = yield stream.next();
    if (firstPayload.done)
        return;
    (0, sse_1.setSseHeaders)(res);
    let clientDisconnected = false;
    req.on("close", () => {
        clientDisconnected = true;
    });
    const writePayload = (payload) => __awaiter(void 0, void 0, void 0, function* () {
        if (clientDisconnected)
            return;
        if (payload.chunk) {
            yield (0, sse_1.splitAndWriteChunk)(res, payload.chunk, {
                requestId: payload.requestId,
                status: payload.status,
            });
        }
        else {
            (0, sse_1.writeSse)(res, payload);
        }
        if (payload.done || payload.error) {
            res.end();
        }
    });
    yield writePayload(firstPayload.value);
    try {
        for (_a = true, stream_1 = __asyncValues(stream); stream_1_1 = yield stream_1.next(), _b = stream_1_1.done, !_b; _a = true) {
            _d = stream_1_1.value;
            _a = false;
            const payload = _d;
            yield writePayload(payload);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_a && !_b && (_c = stream_1.return)) yield _c.call(stream_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
});
exports.createChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chat = yield chat_service_1.chatService.createChat(req.body);
        return res.json(chat);
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to create chat");
    }
}));
const createChatStream = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield pipeStreamResponse(req, res, chat_service_1.chatService.createChatStream(req.body));
    }
    catch (error) {
        console.log("Error in createChatStream:", error);
        if (!res.headersSent) {
            sendControllerError(res, error, "Failed to create chat stream");
        }
        else {
            res.end();
        }
    }
});
exports.createChatStream = createChatStream;
exports.sendMessage = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chat = yield chat_service_1.chatService.sendMessage(Object.assign({ chatId: String(req.params.id) }, req.body));
        return res.json(chat);
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to send message");
    }
}));
exports.getAllChats = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chats = yield chat_service_1.chatService.getAllChats(req.query.userId);
        return res.json(chats);
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to fetch chats");
    }
}));
exports.getChatById = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chat = yield chat_service_1.chatService.getChatById(String(req.params.id));
        return res.json(chat);
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to fetch chat");
    }
}));
const streamMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield pipeStreamResponse(req, res, chat_service_1.chatService.streamMessage(Object.assign({ chatId: String(req.params.id) }, req.body)));
    }
    catch (error) {
        console.log("Error in streamMessage:", error);
        if (!res.headersSent) {
            sendControllerError(res, error, "Failed to initiate stream");
        }
        else {
            res.end();
        }
    }
});
exports.streamMessage = streamMessage;
exports.stopStream = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield chat_service_1.chatService.stopStream(req.body);
        return res.json(result);
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to stop stream");
    }
}));
exports.deleteChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield chat_service_1.chatService.deleteChat(String(req.params.id));
        return res.json({ message: "Chat deleted successfully" });
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to delete chat");
    }
}));
exports.updateChatTitle = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chat = yield chat_service_1.chatService.updateChatTitle(String(req.params.id), req.body.title);
        return res.json(chat);
    }
    catch (error) {
        return sendControllerError(res, error, "Failed to update chat title");
    }
}));
const getStreamUpdates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const chatId = req.params.id;
    const activeStream = chatStreamRegistry_service_1.chatStreamRegistry.getByChatId(chatId);
    if (!activeStream) {
        return res
            .status(200)
            .json({ active: false, message: "No active stream found for this chat" });
    }
    (0, sse_1.setSseHeaders)(res);
    (0, sse_1.writeSse)(res, {
        model: activeStream.model,
        requestId: activeStream.requestId,
        status: activeStream.status,
    });
    if (activeStream.fullResponse) {
        (0, sse_1.writeSse)(res, {
            chunk: activeStream.fullResponse,
            requestId: activeStream.requestId,
            status: activeStream.status,
        });
    }
    const onChunk = (chunk) => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, sse_1.splitAndWriteChunk)(res, chunk, {
            requestId: activeStream.requestId,
            status: activeStream.status,
        });
    });
    const onDone = () => {
        (0, sse_1.writeSse)(res, {
            done: true,
            chatId,
            requestId: activeStream.requestId,
            status: activeStream.status,
        });
        res.end();
    };
    const onError = (errorMsg) => {
        (0, sse_1.writeSse)(res, { error: errorMsg });
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
});
exports.getStreamUpdates = getStreamUpdates;
