export interface ParsedFile {
  success: boolean;
  text: string;
  fileName: string;
  mimeType: string;
  size: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface ParseOptions {
  maxLength?: number;
  timeoutMs?: number;
}

export type ExcelCell = string | number | boolean | Date | null;

export type ExcelRow = ExcelCell[];
