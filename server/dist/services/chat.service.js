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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = void 0;
const chat_constants_1 = require("../constants/chat.constants");
const chat_repository_1 = require("../repositories/chat.repository");
const chatHistory_1 = require("../utils/chatHistory");
const ai_service_1 = require("./ai.service");
const chatStreamRegistry_service_1 = require("./chatStreamRegistry.service");
const getChatId = (chat) => String(chat._id);
const createUserMessage = (content, provider) => ({
    role: "user",
    content,
    model: provider || chat_constants_1.DEFAULT_AI_PROVIDER,
});
const createAssistantMessage = (content, model) => ({
    role: "assistant",
    content,
    model,
});
const createTitle = (message) => {
    return message ? message.slice(0, chat_constants_1.CHAT_TITLE_MAX_LENGTH) : chat_constants_1.DEFAULT_CHAT_TITLE;
};
const requireUserId = (userId) => {
    if (!userId) {
        const error = new Error("userId is required");
        error.name = "ValidationError";
        throw error;
    }
    return userId;
};
const requireMessage = (message, messageText = "message is required") => {
    const trimmedMessage = message === null || message === void 0 ? void 0 : message.trim();
    if (!trimmedMessage) {
        const error = new Error(messageText);
        error.name = "ValidationError";
        throw error;
    }
    return trimmedMessage;
};
const requireChat = (chatId) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield chat_repository_1.chatRepository.findById(chatId);
    if (!chat) {
        const error = new Error("Chat not found");
        error.name = "NotFoundError";
        throw error;
    }
    return chat;
});
function streamAssistantResponse(chat_1, provider_1) {
    return __asyncGenerator(this, arguments, function* streamAssistantResponse_1(chat, provider, includeChatId = false) {
        var _a, e_1, _b, _c;
        const aiProvider = ai_service_1.aiService.getProvider(provider);
        const providerName = aiProvider.getProviderName();
        const chatId = getChatId(chat);
        yield yield __await(includeChatId
            ? { chatId, model: providerName }
            : { model: providerName });
        try {
            const stream = aiProvider.generateStreamResponse((0, chatHistory_1.getLimitedMessages)(chat.messages));
            chatStreamRegistry_service_1.chatStreamRegistry.create(chatId, providerName);
            let fullResponse = "";
            try {
                for (var _d = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield __await(stream_1.next()), _a = stream_1_1.done, !_a; _d = true) {
                    _c = stream_1_1.value;
                    _d = false;
                    const chunk = _c;
                    fullResponse += chunk;
                    chatStreamRegistry_service_1.chatStreamRegistry.updateResponse(chatId, fullResponse, chunk);
                    yield yield __await({ chunk });
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = stream_1.return)) yield __await(_b.call(stream_1));
                }
                finally { if (e_1) throw e_1.error; }
            }
            chat.messages.push(createAssistantMessage(fullResponse, providerName));
            yield __await(chat.save());
            chatStreamRegistry_service_1.chatStreamRegistry.complete(chatId);
            yield yield __await({ done: true, chatId });
        }
        catch (aiError) {
            console.error("AI Error in chat stream:", aiError);
            chatStreamRegistry_service_1.chatStreamRegistry.fail(chatId, "AI failed to respond");
            yield yield __await({ error: "AI failed to respond, but your message was saved." });
        }
    });
}
exports.chatService = {
    createChat(_a) {
        return __awaiter(this, arguments, void 0, function* ({ userId, message, provider }) {
            const resolvedUserId = requireUserId(userId);
            const trimmedMessage = message === null || message === void 0 ? void 0 : message.trim();
            const messages = [];
            if (trimmedMessage) {
                messages.push(createUserMessage(trimmedMessage, provider));
                const aiProvider = ai_service_1.aiService.getProvider(provider);
                const providerName = aiProvider.getProviderName();
                const reply = yield aiProvider.generateResponse((0, chatHistory_1.getLimitedMessages)(messages));
                messages.push(createAssistantMessage(reply, providerName));
            }
            const chat = chat_repository_1.chatRepository.create({
                userId: resolvedUserId,
                title: createTitle(trimmedMessage),
                messages,
            });
            yield chat.save();
            return chat;
        });
    },
    createChatStream(input) {
        return __asyncGenerator(this, arguments, function* createChatStream_1() {
            const resolvedUserId = requireUserId(input.userId);
            const trimmedMessage = requireMessage(input.message, "message is required for streaming creation");
            const chat = chat_repository_1.chatRepository.create({
                userId: resolvedUserId,
                title: createTitle(trimmedMessage),
                messages: [createUserMessage(trimmedMessage, input.provider)],
            });
            yield __await(chat.save());
            yield __await(yield* __asyncDelegator(__asyncValues(streamAssistantResponse(chat, input.provider, true))));
        });
    },
    sendMessage(_a) {
        return __awaiter(this, arguments, void 0, function* ({ chatId, message, provider }) {
            const trimmedMessage = requireMessage(message);
            const chat = yield requireChat(chatId);
            chat.messages.push(createUserMessage(trimmedMessage, provider));
            if (!chat.title || chat.title === chat_constants_1.DEFAULT_CHAT_TITLE) {
                chat.title = createTitle(trimmedMessage);
            }
            const aiProvider = ai_service_1.aiService.getProvider(provider);
            const providerName = aiProvider.getProviderName();
            const reply = yield aiProvider.generateResponse((0, chatHistory_1.getLimitedMessages)(chat.messages));
            chat.messages.push(createAssistantMessage(reply, providerName));
            yield chat.save();
            return chat;
        });
    },
    streamMessage(_a) {
        return __asyncGenerator(this, arguments, function* streamMessage_1({ chatId, message, provider }) {
            const trimmedMessage = requireMessage(message);
            const chat = yield __await(requireChat(chatId));
            chat.messages.push(createUserMessage(trimmedMessage, provider));
            if (!chat.title || chat.title === chat_constants_1.DEFAULT_CHAT_TITLE) {
                chat.title = createTitle(trimmedMessage);
            }
            yield __await(chat.save());
            yield __await(yield* __asyncDelegator(__asyncValues(streamAssistantResponse(chat, provider))));
        });
    },
    getAllChats(userId) {
        return chat_repository_1.chatRepository.findAllByUserId(requireUserId(userId));
    },
    getChatById(chatId) {
        return requireChat(chatId);
    },
    deleteChat(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield chat_repository_1.chatRepository.deleteById(chatId);
            if (!chat) {
                const error = new Error("Chat not found");
                error.name = "NotFoundError";
                throw error;
            }
            return chat;
        });
    },
};
