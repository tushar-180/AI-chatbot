import { MAX_HISTORY_MESSAGES } from "../constants/chat.constants";
import type { ChatMessage } from "../types/chat.types";

export const getLimitedMessages = (messages: ChatMessage[]): ChatMessage[] => {
  return messages.slice(-MAX_HISTORY_MESSAGES);
};

/**
 * Parses markdown content to extract multimedia (like base64 images)
 * into structured attachments.
 */
export const parseMultimedia = (content: string) => {
  // Regex to find markdown images with base64 data
  const imageRegex = /!\[.*?\]\((data:image\/.*?;base64,.*?)\)/g;
  const attachments: any[] = [];
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
