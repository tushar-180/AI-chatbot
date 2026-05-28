import { MAX_HISTORY_MESSAGES } from "../constants/chat.constants";
import type { ChatMessage } from "../types/chat.types";

export const getLimitedMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const MAX_HISTORY_CHARS = 4000;
  const ATTACHMENT_RECENCY_WINDOW = 3; // Only keep attachments on the latest N messages
  const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
  
  if (recentMessages.length === 0) return recentMessages;

  let totalChars = 0;
  const processedMessages: ChatMessage[] = [];

  // Iterate from newest to oldest
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    // Clone the message so we can safely modify it
    const raw = typeof (recentMessages[i] as any).toObject === "function" 
        ? (recentMessages[i] as any).toObject() 
        : { ...recentMessages[i] };
        
    const msg: ChatMessage = { ...raw };
    if (msg.attachments) {
      msg.attachments = msg.attachments.map(a => ({ ...a }));
    }

    // --- Attachment optimization ---
    const distanceFromEnd = recentMessages.length - 1 - i;

    // 1. AI assistant messages: always strip media attachments (images/video/audio).
    //    The AI already generated them; it doesn't need to re-see its own output.
    if (msg.role === "assistant" && msg.attachments && msg.attachments.length > 0) {
      const mediaAtts = msg.attachments.filter(
        a => a.mimeType && (a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/") || a.mimeType.startsWith("audio/"))
      );
      if (mediaAtts.length > 0) {
        const placeholders = mediaAtts.map(a => `[AI generated: ${a.name || "media"}]`).join(", ");
        msg.content = (msg.content || "") + `\n${placeholders}`;
        msg.attachments = msg.attachments.filter(
          a => !(a.mimeType && (a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/") || a.mimeType.startsWith("audio/")))
        );
      }
    }

    // 2. User messages older than ATTACHMENT_RECENCY_WINDOW: replace all attachments
    //    with lightweight text placeholders to save tokens.
    if (msg.role === "user" && distanceFromEnd >= ATTACHMENT_RECENCY_WINDOW && msg.attachments && msg.attachments.length > 0) {
      const placeholders = msg.attachments.map(a => `[Attachment: ${a.name || "file"} (${a.mimeType || "unknown"})]`).join(", ");
      msg.content = (msg.content || "") + `\n${placeholders}`;
      msg.attachments = [];
    }

    // --- Text budget logic ---
    const contentLen = msg.content?.length || 0;
    
    // Always keep the very latest message intact
    if (i === recentMessages.length - 1) {
      totalChars += contentLen;
      processedMessages.unshift(msg);
      continue;
    }

    if (totalChars >= MAX_HISTORY_CHARS) {
      break; // Budget exhausted, drop older messages
    }

    if (totalChars + contentLen > MAX_HISTORY_CHARS) {
      const allowedChars = MAX_HISTORY_CHARS - totalChars;
      if (allowedChars > 100) {
        msg.content = msg.content.substring(0, allowedChars) + "\n...[Truncated for length]";
        totalChars += allowedChars;
        processedMessages.unshift(msg);
      }
      break; // Budget exhausted
    } else {
      totalChars += contentLen;
      processedMessages.unshift(msg);
    }
  }

  return processedMessages;
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
