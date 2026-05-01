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
exports.GeminiAdapter = void 0;
const genai_1 = require("@google/genai");
const types_1 = require("../types");
const constants_1 = require("../constants");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class GeminiAdapter {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new types_1.AIServiceError("Gemini API key missing", 500);
        }
        this.ai = new genai_1.GoogleGenAI({ apiKey });
        this.model = constants_1.AI_PROVIDERS.GEMINI.models[0];
    }
    getProviderName() {
        return (0, constants_1.getDisplayProviderName)(constants_1.AI_PROVIDERS.GEMINI.id, this.model);
    }
    setModel(model) {
        this.model = model;
    }
    generateResponse(messages) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const contents = messages
                .filter((msg) => msg.role !== "system")
                .map((msg) => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }],
            }));
            const systemMessage = messages.find((msg) => msg.role === "system");
            try {
                const res = yield this.ai.models.generateContent({
                    model: this.model,
                    contents,
                    config: {
                        systemInstruction: systemMessage
                            ? {
                                parts: [{ text: systemMessage.content }],
                            }
                            : {
                                parts: [
                                    {
                                        text: `
You are a professional AI developer assistant.

OUTPUT RULES (VERY IMPORTANT):

1. Always format responses using clean Markdown.

2. For code:
   - ALWAYS use triple backticks
   - ALWAYS specify language
   - Never return raw code without code blocks

3. Supported languages: js, ts, json, bash, html, css.

4. Inline code: Use single backticks.

5. Structure responses: Use headings (##, ###), bullet points, and clean spacing.

6. Code quality: Proper indentation and clean formatting.

7. Do NOT: wrap full response in a code block or output broken markdown.

8. When explaining code: Give explanation first, then the code block.

9. Keep responses: Clean, developer-friendly, and easy to read.
      `,
                                    },
                                ],
                            },
                    },
                });
                const text = ((_e = (_d = (_c = (_b = (_a = res === null || res === void 0 ? void 0 : res.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || (res === null || res === void 0 ? void 0 : res.text) || "";
                return text.trim() || "No response generated.";
            }
            catch (error) {
                console.error("Gemini Adapter Error:", error);
                throw new types_1.AIServiceError(error.message, error.status || 500);
            }
        });
    }
    generateStreamResponse(messages) {
        return __asyncGenerator(this, arguments, function* generateStreamResponse_1() {
            var _a, e_1, _b, _c;
            const contents = messages
                .filter((msg) => msg.role !== "system")
                .map((msg) => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }],
            }));
            const systemMessage = messages.find((msg) => msg.role === "system");
            try {
                const res = yield __await(this.ai.models.generateContentStream({
                    model: this.model,
                    contents,
                    config: {
                        systemInstruction: systemMessage
                            ? {
                                parts: [{ text: systemMessage.content }],
                            }
                            : undefined, // Default system instruction is already in the class logic, but here we can keep it simple or repeat it
                    },
                }));
                try {
                    for (var _d = true, res_1 = __asyncValues(res), res_1_1; res_1_1 = yield __await(res_1.next()), _a = res_1_1.done, !_a; _d = true) {
                        _c = res_1_1.value;
                        _d = false;
                        const chunk = _c;
                        const text = chunk.text;
                        if (text) {
                            yield yield __await(text);
                        }
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = res_1.return)) yield __await(_b.call(res_1));
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            catch (error) {
                console.error("Gemini Adapter Stream Error:", error);
                throw new types_1.AIServiceError(error.message, error.status || 500);
            }
        });
    }
}
exports.GeminiAdapter = GeminiAdapter;
