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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NvidiaAdapter = void 0;
const openai_1 = __importDefault(require("openai"));
const types_1 = require("../types");
const constants_1 = require("../constants");
class NvidiaAdapter {
    constructor() {
        this.model = constants_1.AI_PROVIDERS.NVIDIA.models[0];
        const apiKey = process.env.NVIDIA_API_KEY;
        const baseURL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
        if (!apiKey) {
            console.error("NVIDIA_API_KEY is not defined in environment variables");
        }
        this.openai = new openai_1.default({
            apiKey: apiKey,
            baseURL: baseURL,
        });
    }
    getProviderName() {
        return (0, constants_1.getDisplayProviderName)(constants_1.AI_PROVIDERS.NVIDIA.id, this.model);
    }
    setModel(model) {
        this.model = model;
    }
    formatMessages(messages) {
        const isVision = (0, constants_1.supportsVision)(this.model);
        const systemMessages = messages.filter((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system");
        const formattedMessages = [];
        if (systemMessages.length > 0) {
            const combinedSystemContent = systemMessages
                .map((m) => m.content)
                .join("\n\n---\n\n");
            formattedMessages.push({
                role: "system",
                content: combinedSystemContent,
            });
        }
        const formattedChatMessages = chatMessages.map((m) => {
            let content = m.content;
            // If there are attachments and the model doesn't support vision, append them as text
            if (m.attachments && m.attachments.length > 0) {
                if (!isVision) {
                    const attachmentText = m.attachments
                        .map((a) => `\n[Image: ${a.url}]`)
                        .join("");
                    content += attachmentText;
                }
                else {
                    // Format for multimodal models (OpenAI style)
                    content = [
                        { type: "text", text: m.content },
                        ...m.attachments.map((a) => ({
                            type: "image_url",
                            image_url: { url: a.url },
                        })),
                    ];
                }
            }
            return {
                role: m.role,
                content,
            };
        });
        return [...formattedMessages, ...formattedChatMessages];
    }
    generateResponse(messages) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const completion = yield this.openai.chat.completions.create({
                    model: this.model,
                    messages: this.formatMessages(messages),
                    temperature: 0.6,
                    top_p: 0.7,
                    max_tokens: 4096,
                });
                return ((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "";
            }
            catch (error) {
                console.error("NVIDIA generateResponse error:", error);
                throw new types_1.AIServiceError(error.message || "Failed to generate response from NVIDIA NIM", error.status);
            }
        });
    }
    generateStreamResponse(messages, signal) {
        return __asyncGenerator(this, arguments, function* generateStreamResponse_1() {
            var _a, e_1, _b, _c;
            var _d, _e;
            try {
                const stream = yield __await(this.openai.chat.completions.create({
                    model: this.model,
                    messages: this.formatMessages(messages),
                    temperature: 0.6,
                    top_p: 0.7,
                    max_tokens: 4096,
                    stream: true,
                }, {
                    signal,
                }));
                try {
                    for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield __await(stream_1.next()), _a = stream_1_1.done, !_a; _f = true) {
                        _c = stream_1_1.value;
                        _f = false;
                        const chunk = _c;
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                            return yield __await(void 0);
                        }
                        const content = ((_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content) || "";
                        if (content) {
                            yield yield __await(content);
                        }
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
            catch (error) {
                console.error("NVIDIA generateStreamResponse error:", error);
                throw new types_1.AIServiceError(error.message || "Failed to generate stream response from NVIDIA NIM", error.status);
            }
        });
    }
    generateEmbedding(text) {
        return __awaiter(this, void 0, void 0, function* () {
            // NVIDIA NIM supports embeddings, but we'd need to use a specific embedding model
            // For now, returning empty array as a stub
            return [];
        });
    }
}
exports.NvidiaAdapter = NvidiaAdapter;
