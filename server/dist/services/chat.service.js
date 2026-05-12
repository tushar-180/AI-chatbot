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
const prompt_constants_1 = require("../constants/prompt.constants");
const chat_repository_1 = require("../repositories/chat.repository");
const chatHistory_1 = require("../utils/chatHistory");
const web_search_1 = require("../modules/web-search");
const ai_service_1 = require("./ai.service");
const chatStreamRegistry_service_1 = require("./chatStreamRegistry.service");
const memory_service_1 = require("./memory.service");
const user_service_1 = require("./user.service");
const getChatId = (chat) => String(chat._id);
const createUserMessage = (content, userId, provider, attachments) => ({
    role: "user",
    userId,
    content,
    model: provider || chat_constants_1.DEFAULT_AI_PROVIDER,
    status: "completed",
    attachments: attachments || [],
    type: attachments && attachments.length > 0 ? "image" : "text",
});
const createAssistantMessage = (content, userId, model, requestId, status = "completed", metadata) => ({
    role: "assistant",
    userId,
    content,
    model,
    requestId,
    status,
    metadata,
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
const requireRequestId = (requestId) => {
    if (!requestId) {
        const error = new Error("requestId is required");
        error.name = "ValidationError";
        throw error;
    }
    return requestId;
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
const getAssistantMessageByRequestId = (chat, requestId) => chat.messages.find((message) => message.role === "assistant" && message.requestId === requestId);
const buildGroundingMetadata = (webGrounding) => {
    if (!webGrounding)
        return undefined;
    return {
        grounded: true,
        query: webGrounding.query,
        resolvedQuery: webGrounding.resolvedQuery,
        normalizedQuery: webGrounding.normalizedQuery,
        reusedPreviousQuery: webGrounding.reusedPreviousQuery,
        liveDataQuery: webGrounding.liveDataQuery,
        confidence: webGrounding.confidence,
        debug: webGrounding.debug,
        sources: webGrounding.sources.map(({ id, title, url, hostname }) => ({
            id,
            title,
            url,
            hostname,
        })),
    };
};
const finalizeGroundedResponse = (response, webGrounding) => {
    if (!(webGrounding === null || webGrounding === void 0 ? void 0 : webGrounding.citationsMarkdown)) {
        return { content: response, appendedCitations: "" };
    }
    const alreadyHasSources = webGrounding.sources.some((source) => response.includes(source.url));
    if (alreadyHasSources || /(^|\n)Sources:\s*$/im.test(response)) {
        return { content: response, appendedCitations: "" };
    }
    const appendedCitations = webGrounding.citationsMarkdown;
    return {
        content: `${response.trimEnd()}${appendedCitations}`,
        appendedCitations,
    };
};
const buildPromptMessages = (userId_1, chatMessages_1, latestUserMessage_1, ...args_1) => __awaiter(void 0, [userId_1, chatMessages_1, latestUserMessage_1, ...args_1], void 0, function* (userId, chatMessages, latestUserMessage, webSearchEnabled = false) {
    const promptMessages = (0, chatHistory_1.getLimitedMessages)(chatMessages);
    const systemMessages = [
        {
            role: "system",
            content: prompt_constants_1.BASE_SYSTEM_PROMPT,
            userId,
            status: "completed",
        },
    ];
    const personalizationContext = yield user_service_1.userService.getPersonalizationContext(userId);
    if (personalizationContext) {
        systemMessages.push({
            role: "system",
            content: personalizationContext,
            userId,
            status: "completed",
        });
    }
    const memoryContext = yield memory_service_1.memoryService.getMemoryContext(userId, latestUserMessage);
    if (memoryContext) {
        systemMessages.push({
            role: "system",
            content: memoryContext,
            userId,
            status: "completed",
        });
    }
    let webGrounding = null;
    if (webSearchEnabled && latestUserMessage) {
        webGrounding = yield web_search_1.webSearchService.buildGroundingContext(latestUserMessage, chatMessages);
    }
    if (webGrounding) {
        systemMessages.push({
            role: "system",
            content: webGrounding.systemPrompt,
            userId,
            status: "completed",
        });
    }
    return {
        promptMessages: [...systemMessages, ...promptMessages],
        webGrounding,
    };
});
function streamAssistantResponse(chat_1, requestId_1, provider_1) {
    return __asyncGenerator(this, arguments, function* streamAssistantResponse_1(chat, requestId, provider, includeChatId = false) {
        var _a, e_1, _b, _c;
        var _d, _e;
        const aiProvider = ai_service_1.aiService.getProvider(provider);
        const providerName = aiProvider.getProviderName();
        const chatId = getChatId(chat);
        const lastUserMessage = chat.messages
            .filter((m) => m.role === "user")
            .pop();
        const { promptMessages, webGrounding } = yield __await(buildPromptMessages(String(chat.userId), chat.messages, lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.content, Boolean((_d = lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.metadata) === null || _d === void 0 ? void 0 : _d.webSearchEnabled)));
        // Create assistant message in its own collection
        const assistantMessageDoc = yield __await(chat_repository_1.chatRepository.saveMessage(chatId, {
            role: "assistant",
            userId: chat.userId,
            content: "",
            model: providerName,
            requestId,
            status: "streaming",
            metadata: buildGroundingMetadata(webGrounding),
        }));
        const activeStream = chatStreamRegistry_service_1.chatStreamRegistry.create({
            requestId,
            chatId,
            messageId: ((_e = assistantMessageDoc._id) === null || _e === void 0 ? void 0 : _e.toString()) || "",
            model: providerName,
        });
        yield yield __await(includeChatId
            ? { chatId, requestId, model: providerName, status: "streaming" }
            : { requestId, model: providerName, status: "streaming" });
        let fullResponse = "";
        let receivedFirstChunk = false;
        let firstTokenTimedOut = false;
        try {
            const stream = aiProvider.generateStreamResponse(promptMessages, activeStream.abortController.signal);
            // 30s timeout for first token
            const timeout = setTimeout(() => {
                if (!receivedFirstChunk) {
                    console.error(`AI generation timed out for requestId: ${requestId}`);
                    firstTokenTimedOut = true;
                    activeStream.abortController.abort();
                }
            }, 30000);
            try {
                try {
                    for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield __await(stream_1.next()), _a = stream_1_1.done, !_a; _f = true) {
                        _c = stream_1_1.value;
                        _f = false;
                        const chunk = _c;
                        if (activeStream.abortController.signal.aborted) {
                            break;
                        }
                        if (!receivedFirstChunk) {
                            receivedFirstChunk = true;
                            firstTokenTimedOut = false;
                            clearTimeout(timeout);
                        }
                        fullResponse += chunk;
                        chatStreamRegistry_service_1.chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
                        yield yield __await({ chunk, requestId, status: "streaming" });
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_f && !_a && (_b = stream_1.return)) yield __await(_b.call(stream_1));
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            finally {
                clearTimeout(timeout);
            }
            const groundedResponse = finalizeGroundedResponse(fullResponse, webGrounding);
            if (groundedResponse.appendedCitations &&
                !activeStream.abortController.signal.aborted) {
                fullResponse = groundedResponse.content;
                chatStreamRegistry_service_1.chatStreamRegistry.updateResponse(requestId, fullResponse, groundedResponse.appendedCitations);
                yield yield __await({
                    chunk: groundedResponse.appendedCitations,
                    requestId,
                    status: "streaming",
                });
            }
            const finalStatus = activeStream.abortController.signal.aborted
                ? "stopped"
                : "completed";
            // Parse multimedia from the final response
            const { attachments, type } = (0, chatHistory_1.parseMultimedia)(fullResponse);
            // Update message doc in collection
            yield __await(chat_repository_1.chatRepository.updateMessage(assistantMessageDoc._id, {
                content: fullResponse,
                status: finalStatus,
                model: providerName,
                attachments,
                type: type,
                metadata: buildGroundingMetadata(webGrounding),
            }));
            if (activeStream.abortController.signal.aborted) {
                yield yield __await({ done: true, chatId, requestId, status: "stopped" });
                return yield __await(void 0);
            }
            chatStreamRegistry_service_1.chatStreamRegistry.complete(requestId);
            yield yield __await({ done: true, chatId, requestId, status: "completed" });
            // Extract new memories in the background
            const lastUserMessage = chat.messages
                .filter((m) => m.role === "user")
                .pop();
            if (lastUserMessage) {
                memory_service_1.memoryService
                    .extractMemoriesFromMessage(chat.userId, lastUserMessage.content)
                    .catch((err) => {
                    console.error("Background memory extraction failed:", err);
                });
            }
        }
        catch (aiError) {
            const isTimeout = (aiError instanceof Error && aiError.message.includes("timed out")) ||
                firstTokenTimedOut;
            const errorMessage = isTimeout
                ? "AI generation timed out. Please try again."
                : "Server Error: AI failed to respond.";
            if (activeStream.abortController.signal.aborted && !isTimeout) {
                yield __await(chat_repository_1.chatRepository.updateMessage(assistantMessageDoc._id, {
                    content: activeStream.fullResponse,
                    status: "stopped",
                }));
                yield yield __await({ done: true, chatId, requestId, status: "stopped" });
                return yield __await(void 0);
            }
            console.error("AI Error in chat stream:", aiError);
            yield __await(chat_repository_1.chatRepository.updateMessage(assistantMessageDoc._id, {
                status: "failed",
            }));
            chatStreamRegistry_service_1.chatStreamRegistry.fail(requestId, errorMessage);
            yield yield __await({ error: errorMessage, status: "failed" });
        }
    });
}
exports.chatService = {
    createChat(_a) {
        return __awaiter(this, arguments, void 0, function* ({ userId, message, provider, attachments, webSearchEnabled, }) {
            const resolvedUserId = requireUserId(userId);
            const trimmedMessage = (message === null || message === void 0 ? void 0 : message.trim()) || "";
            const chat = chat_repository_1.chatRepository.create({
                userId: resolvedUserId,
                title: createTitle(trimmedMessage),
            });
            yield chat.save();
            const chatId = chat._id.toString();
            if (trimmedMessage || (attachments && attachments.length > 0)) {
                // Save User Message
                const userMessage = createUserMessage(trimmedMessage || "", String(resolvedUserId), provider, attachments);
                userMessage.metadata = {
                    webSearchEnabled: Boolean(webSearchEnabled),
                };
                yield chat_repository_1.chatRepository.saveMessage(chatId, userMessage);
                const aiProvider = ai_service_1.aiService.getProvider(provider);
                const providerName = aiProvider.getProviderName();
                // Get history for context
                const messages = [userMessage];
                const { promptMessages, webGrounding } = yield buildPromptMessages(String(resolvedUserId), messages, trimmedMessage, webSearchEnabled);
                let reply = "";
                try {
                    reply = yield aiProvider.generateResponse(promptMessages);
                }
                catch (err) {
                    console.error("AI Error in createChat:", err);
                    throw new Error("Server Error: AI failed to respond.");
                }
                reply = finalizeGroundedResponse(reply, webGrounding).content;
                // Parse multimedia from reply
                const { attachments: aiAttachments, type } = (0, chatHistory_1.parseMultimedia)(reply);
                // Save Assistant Message
                yield chat_repository_1.chatRepository.saveMessage(chatId, Object.assign(Object.assign({}, createAssistantMessage(reply, String(resolvedUserId), providerName, undefined, "completed", buildGroundingMetadata(webGrounding))), { attachments: aiAttachments, type: type }));
                // Extract new memories in the background
                if (trimmedMessage) {
                    memory_service_1.memoryService
                        .extractMemoriesFromMessage(resolvedUserId, trimmedMessage)
                        .catch((err) => {
                        console.error("Background memory extraction failed:", err);
                    });
                }
            }
            // Fetch the full chat with messages to return
            return yield chat_repository_1.chatRepository.findById(chatId);
        });
    },
    createChatStream(input) {
        return __asyncGenerator(this, arguments, function* createChatStream_1() {
            const resolvedUserId = requireUserId(input.userId);
            const trimmedMessage = requireMessage(input.message, "message is required for streaming creation");
            const requestId = requireRequestId(input.requestId);
            const chat = chat_repository_1.chatRepository.create({
                userId: resolvedUserId,
                title: createTitle(trimmedMessage),
            });
            yield __await(chat.save());
            const chatId = chat._id.toString();
            // Save User Message
            yield __await(chat_repository_1.chatRepository.saveMessage(chatId, Object.assign(Object.assign({}, createUserMessage(trimmedMessage, String(resolvedUserId), input.provider, input.attachments)), { metadata: {
                    webSearchEnabled: Boolean(input.webSearchEnabled),
                } })));
            // Refetch to get messages for prompt
            const fullChat = yield __await(chat_repository_1.chatRepository.findById(chatId));
            yield __await(yield* __asyncDelegator(__asyncValues(streamAssistantResponse(fullChat, requestId, input.provider, true))));
        });
    },
    sendMessage(_a) {
        return __awaiter(this, arguments, void 0, function* ({ chatId, message, provider, attachments, webSearchEnabled, }) {
            const trimmedMessage = (message === null || message === void 0 ? void 0 : message.trim()) || "";
            const chat = yield requireChat(chatId);
            // Save User Message
            yield chat_repository_1.chatRepository.saveMessage(chatId, Object.assign(Object.assign({}, createUserMessage(trimmedMessage, String(chat.userId), provider, attachments)), { metadata: {
                    webSearchEnabled: Boolean(webSearchEnabled),
                } }));
            if (!chat.title || chat.title === chat_constants_1.DEFAULT_CHAT_TITLE) {
                chat.title = createTitle(trimmedMessage);
                yield chat.save();
            }
            const aiProvider = ai_service_1.aiService.getProvider(provider);
            const providerName = aiProvider.getProviderName();
            // Fetch updated history
            const updatedChat = yield chat_repository_1.chatRepository.findById(chatId);
            const { promptMessages, webGrounding } = yield buildPromptMessages(String(chat.userId), updatedChat === null || updatedChat === void 0 ? void 0 : updatedChat.messages, trimmedMessage, webSearchEnabled);
            let reply = "";
            try {
                reply = yield aiProvider.generateResponse(promptMessages);
            }
            catch (err) {
                console.error("AI Error in sendMessage:", err);
                throw new Error("Server Error: AI failed to respond.");
            }
            reply = finalizeGroundedResponse(reply, webGrounding).content;
            // Parse multimedia from reply
            const { attachments: aiAttachments, type } = (0, chatHistory_1.parseMultimedia)(reply);
            // Save Assistant Message
            yield chat_repository_1.chatRepository.saveMessage(chatId, Object.assign(Object.assign({}, createAssistantMessage(reply, String(chat.userId), providerName, undefined, "completed", buildGroundingMetadata(webGrounding))), { attachments: aiAttachments, type: type }));
            // Extract new memories in the background
            if (trimmedMessage) {
                memory_service_1.memoryService
                    .extractMemoriesFromMessage(String(chat.userId), trimmedMessage)
                    .catch((err) => {
                    console.error("Background memory extraction failed:", err);
                });
            }
            return yield chat_repository_1.chatRepository.findById(chatId);
        });
    },
    streamMessage(_a) {
        return __asyncGenerator(this, arguments, function* streamMessage_1({ chatId, message, provider, requestId, attachments, webSearchEnabled, }) {
            const trimmedMessage = (message === null || message === void 0 ? void 0 : message.trim()) || "";
            const resolvedRequestId = requireRequestId(requestId);
            const chat = yield __await(requireChat(chatId));
            // Save User Message
            yield __await(chat_repository_1.chatRepository.saveMessage(chatId, Object.assign(Object.assign({}, createUserMessage(trimmedMessage, String(chat.userId), provider, attachments)), { metadata: {
                    webSearchEnabled: Boolean(webSearchEnabled),
                } })));
            if (!chat.title || chat.title === chat_constants_1.DEFAULT_CHAT_TITLE) {
                chat.title = createTitle(trimmedMessage);
                yield __await(chat.save());
            }
            // Refresh chat to include new user message
            const updatedChat = yield __await(chat_repository_1.chatRepository.findById(chatId));
            yield __await(yield* __asyncDelegator(__asyncValues(streamAssistantResponse(updatedChat, resolvedRequestId, provider))));
        });
    },
    stopStream(_a) {
        return __awaiter(this, arguments, void 0, function* ({ requestId, chatId }) {
            const resolvedRequestId = requireRequestId(requestId);
            const activeStream = chatStreamRegistry_service_1.chatStreamRegistry.get(resolvedRequestId);
            if (activeStream) {
                // Update message doc in collection
                yield chat_repository_1.chatRepository.updateMessageByRequestId(activeStream.chatId, resolvedRequestId, {
                    content: activeStream.fullResponse,
                    status: "stopped",
                });
                chatStreamRegistry_service_1.chatStreamRegistry.stop(resolvedRequestId);
                return {
                    stopped: true,
                    chatId: activeStream.chatId,
                    requestId: resolvedRequestId,
                };
            }
            if (chatId) {
                yield chat_repository_1.chatRepository.updateMessageByRequestId(chatId, resolvedRequestId, {
                    status: "stopped",
                });
            }
            return {
                stopped: false,
                chatId,
                requestId: resolvedRequestId,
            };
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
    updateChatTitle(chatId, title) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield requireChat(chatId);
            chat.title = requireMessage(title, "Title is required");
            yield chat.save();
            return chat;
        });
    },
    getGallery(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolvedUserId = requireUserId(userId);
            const messages = yield chat_repository_1.chatRepository.findUserAttachments(resolvedUserId);
            const gallery = [];
            for (const msg of messages) {
                if (!msg.attachments)
                    continue;
                for (const att of msg.attachments) {
                    gallery.push({
                        url: att.url,
                        name: att.name,
                        mimeType: att.mimeType,
                        size: att.size,
                        messageId: String(msg._id),
                        chatId: String(msg.chatId),
                        createdAt: msg.createdAt,
                    });
                }
            }
            return gallery;
        });
    },
};
