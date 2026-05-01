"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLimitedMessages = void 0;
const chat_constants_1 = require("../constants/chat.constants");
const getLimitedMessages = (messages) => {
    return messages.slice(-chat_constants_1.MAX_HISTORY_MESSAGES);
};
exports.getLimitedMessages = getLimitedMessages;
