export interface ParsedDocument {
    success: boolean;
    text: string;
    fileName: string;
    mimeType: string;
    size: number;
    error?: {
        code: string;
        message: string;
    }
}

export interface ParseOptions {
  maxLength?: number;
  timeoutMs?: number;
}