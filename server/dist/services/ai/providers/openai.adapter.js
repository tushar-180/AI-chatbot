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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIAdapter = void 0;
const constants_1 = require("../constants");
/**
 * Placeholder for OpenAI implementation.
 * In a real scenario, you would install 'openai' and use it here.
 */
class OpenAIAdapter {
    constructor() {
        this.model = constants_1.AI_PROVIDERS.OPENAI.models[0];
    }
    getProviderName() {
        return (0, constants_1.getDisplayProviderName)(constants_1.AI_PROVIDERS.OPENAI.id, this.model);
    }
    setModel(model) {
        this.model = model;
    }
    generateResponse(messages) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("OpenAI Adapter: Generating response (Mock)");
            return "OpenAI support is currently in placeholder mode. Please implement the OpenAI SDK integration in openai.adapter.ts.";
        });
    }
    generateStreamResponse(messages) {
        return __asyncGenerator(this, arguments, function* generateStreamResponse_1() {
            console.log("OpenAI Adapter: Generating stream response (Mock)");
            const mockText = "OpenAI streaming support is currently in placeholder mode.";
            for (const word of mockText.split(" ")) {
                yield yield __await(word + " ");
                yield __await(new Promise((resolve) => setTimeout(resolve, 100)));
            }
        });
    }
}
exports.OpenAIAdapter = OpenAIAdapter;
