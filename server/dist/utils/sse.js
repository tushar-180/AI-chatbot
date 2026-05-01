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
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitAndWriteChunk = exports.writeSse = exports.setSseHeaders = void 0;
const setSseHeaders = (res) => {
    var _a, _b;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (_a = res.socket) === null || _a === void 0 ? void 0 : _a.setNoDelay(true);
    (_b = res.flushHeaders) === null || _b === void 0 ? void 0 : _b.call(res);
};
exports.setSseHeaders = setSseHeaders;
const writeSse = (res, payload) => {
    var _a, _b;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    (_b = (_a = res).flush) === null || _b === void 0 ? void 0 : _b.call(_a);
};
exports.writeSse = writeSse;
const splitAndWriteChunk = (res, chunk) => __awaiter(void 0, void 0, void 0, function* () {
    if (chunk.length > 25) {
        const parts = chunk.split(/(\s+)/);
        for (const part of parts) {
            if (part) {
                (0, exports.writeSse)(res, { chunk: part });
                yield new Promise((resolve) => setTimeout(resolve, 15));
            }
        }
        return;
    }
    (0, exports.writeSse)(res, { chunk });
});
exports.splitAndWriteChunk = splitAndWriteChunk;
