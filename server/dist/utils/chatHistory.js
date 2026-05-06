"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMultimedia = exports.getLimitedMessages = void 0;
const chat_constants_1 = require("../constants/chat.constants");
const getLimitedMessages = (messages) => {
    return messages.slice(-chat_constants_1.MAX_HISTORY_MESSAGES);
};
exports.getLimitedMessages = getLimitedMessages;
/**
 * Parses markdown content to extract multimedia (like base64 images)
 * into structured attachments.
 */
const parseMultimedia = (content) => {
    // Regex to find markdown images with base64 data
    const imageRegex = /!\[.*?\]\((data:image\/.*?;base64,.*?)\)/g;
    const attachments = [];
    let cleanContent = content;
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
        attachments.push({
            url: match[1],
            name: 'Generated Image',
            mimeType: match[1].split(';')[0].split(':')[1],
        });
        // Optional: Remove the image from content to avoid duplicate rendering
        // But for now, we keep it for backward compatibility if frontend doesn't use attachments
        // cleanContent = cleanContent.replace(match[0], '');
    }
    return {
        content: cleanContent.trim(),
        attachments,
        type: attachments.length > 0 ? 'image' : 'text'
    };
};
exports.parseMultimedia = parseMultimedia;
