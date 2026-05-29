// src/modules/tools/youtube/transcript.ts
import { YoutubeTranscript } from 'youtube-transcript';
import type {
  YouTubeTranscriptOptions,
  YouTubeTranscriptResult,
  TranscriptEntry,
} from '../../../types/youtube.types';

/**
 * Validates that the input is a valid YouTube video ID.
 */
function isValidVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * Fetches and processes a YouTube transcript.
 * Note: The videoIdOrUrl parameter must be a valid 11-character video ID (not a full URL).
 */
export async function extractTranscript(
  options: YouTubeTranscriptOptions
): Promise<YouTubeTranscriptResult> {
  const { videoIdOrUrl, includeTimestamps = false, maxLength } = options;

  // Validate that input is a video ID, not a URL
  if (!isValidVideoId(videoIdOrUrl)) {
    return {
      success: false,
      error: {
        code: 'INVALID_URL',
        message: 'Invalid YouTube video ID (expected 11-character ID)',
      },
    };
  }

  const videoId = videoIdOrUrl;

  try {
    const transcriptEntries = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptEntries || transcriptEntries.length === 0) {
      return {
        success: false,
        error: {
          code: 'TRANSCRIPT_NOT_FOUND',
          message: 'No transcript available for this video',
        },
      };
    }

    const detectedLanguage = 'unknown';

    // Build plain text
    let fullText = transcriptEntries.map(entry => entry.text).join(' ');

    let truncated = false;
    let finalText = fullText;
    let finalEntries: TranscriptEntry[] | undefined = undefined;

    if (maxLength && fullText.length > maxLength) {
      truncated = true;
      finalText = fullText.slice(0, maxLength);
      if (includeTimestamps) {
        let accumulatedLength = 0;
        const truncatedEntries: TranscriptEntry[] = [];
        for (const entry of transcriptEntries) {
          const entryText = entry.text;
          if (accumulatedLength + entryText.length <= maxLength) {
            truncatedEntries.push({
              text: entryText,
              offset: entry.offset,
              duration: entry.duration,
            });
            accumulatedLength += entryText.length;
          } else {
            const remaining = maxLength - accumulatedLength;
            if (remaining > 0) {
              truncatedEntries.push({
                text: entryText.slice(0, remaining),
                offset: entry.offset,
                duration: entry.duration,
              });
            }
            break;
          }
        }
        finalEntries = truncatedEntries;
      }
    } else if (includeTimestamps) {
      finalEntries = transcriptEntries.map(entry => ({
        text: entry.text,
        offset: entry.offset,
        duration: entry.duration,
      }));
    }

    return {
      success: true,
      videoId,
      language: detectedLanguage,
      entries: finalEntries,
      text: finalText,
      length: finalText.length,
      truncated,
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    
    if (errorMessage.includes('Could not find a transcript')) {
      return {
        success: false,
        error: {
          code: 'TRANSCRIPT_DISABLED',
          message: 'This video does not have captions or transcripts available',
          originalError: error,
        },
      };
    }
    
    if (errorMessage.includes('Video unavailable')) {
      return {
        success: false,
        error: {
          code: 'VIDEO_NOT_FOUND',
          message: 'Video not found or is private',
          originalError: error,
        },
      };
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
          originalError: error,
        },
      };
    }

    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network error while fetching transcript',
          originalError: error,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'UNKNOWN',
        message: `Failed to fetch transcript: ${errorMessage}`,
        originalError: error,
      },
    };
  }
}