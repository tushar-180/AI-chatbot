export interface YouTubeTranscriptOptions {
  videoIdOrUrl: string;
  includeTimestamps?: boolean;
  maxLength?: number;
}

export interface TranscriptEntry {
  text: string;
  offset: number;
  duration: number;
}

export interface YouTubeTranscriptSuccess {
  success: true;
  videoId: string;
  language: string;
  entries?: TranscriptEntry[];
  text: string;
  length: number;
  truncated: boolean;
}

export interface YouTubeTranscriptError {
  success: false;
  error: {
    code: YouTubeErrorCode;
    message: string;
    originalError?: unknown;
  };
}

export type YouTubeTranscriptResult = YouTubeTranscriptSuccess | YouTubeTranscriptError;

export type YouTubeErrorCode =
  | 'VIDEO_NOT_FOUND'
  | 'TRANSCRIPT_DISABLED'
  | 'TRANSCRIPT_NOT_FOUND'
  | 'INVALID_URL'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface YouTubeToolConfig {
  enableCache?: boolean;
  cacheTTL?: number;
  userAgent?: string;
  timeout?: number;
}