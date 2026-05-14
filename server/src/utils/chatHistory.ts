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
  // Regex to find markdown images and HTML img tags
  const markdownImageRegex = /!\[.*?\]\((.*?)\)/g;
  const htmlImageRegex = /<img.*?src=["'](.*?)["'].*?>/g;
  
  const attachments: any[] = [];
  let imgMatch;
  
  // Extract markdown images
  while ((imgMatch = markdownImageRegex.exec(content)) !== null) {
    const url = imgMatch[1];
    if (url && (url.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(url))) {
      attachments.push({
        url: url,
        name: 'Image',
        mimeType: url.startsWith('data:image') ? url.split(';')[0].split(':')[1] : 'image/remote',
      });
    }
  }

  // Extract HTML images
  while ((imgMatch = htmlImageRegex.exec(content)) !== null) {
    const url = imgMatch[1];
    if (url) {
      attachments.push({
        url: url,
        name: 'Image',
        mimeType: url.startsWith('data:image') ? url.split(';')[0].split(':')[1] : 'image/remote',
      });
    }
  }
  
  return {
    content: content.trim(),
    attachments,
    type: attachments.length > 0 ? 'image' : 'text'
  };
};
