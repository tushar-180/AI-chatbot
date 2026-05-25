import path from 'node:path';
import { PDFParse } from 'pdf-parse';

import mammoth from 'mammoth';

import readXlsxFile from 'read-excel-file/node';
type ExcelCell =
  | string
  | number
  | boolean
  | Date
  | null;

type ExcelRow = ExcelCell[];


import type {
  ParsedFile,
  ParseOptions,
} from './types';


const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.txt',
]);

export async function parseFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: ParseOptions = {}
): Promise<ParsedFile> {
  try {
    validateInput(buffer, fileName);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
    if (buffer.length > MAX_FILE_SIZE) {
      return createErrorResponse({
        fileName,
        mimeType,
        size: buffer.length,
        code: 'FILE_TOO_LARGE',
        message: `File size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.`,
      });
    }

    const extension = path
      .extname(fileName)
      .toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return createErrorResponse({
        fileName,
        mimeType,
        size: buffer.length,
        code: 'UNSUPPORTED_FILE',
        message: `Unsupported file type: ${extension}`,
      });
    }

    let extractedText = '';

    const parsePromise = (async () => {
      switch (extension) {
        case '.pdf':
          return await parsePDF(buffer);
        case '.docx':
          return await parseDOCX(buffer);
        case '.xlsx':
          return await parseXLSX(buffer);
        case '.txt':
          return buffer.toString('utf8');
        case '.csv':
          return await parseCSV(buffer);
        default:
          return null;
      }
    })();

    const timeoutMs = 15000;
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error(`File parsing timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const result = await Promise.race([parsePromise, timeoutPromise]);

    if (result === null) {
      return createErrorResponse({
        fileName,
        mimeType,
        size: buffer.length,
        code: 'UNSUPPORTED_FILE',
        message: 'Unsupported file type.',
      });
    }

    extractedText = result;

    if (options.maxLength && extractedText.length > options.maxLength) {
      extractedText = extractedText.substring(0, options.maxLength);
    }

    const normalizedText =
      normalizeText(extractedText);

    if (!normalizedText) {
      return createErrorResponse({
        fileName,
        mimeType,
        size: buffer.length,
        code: 'EMPTY_TEXT',
        message:
          'No readable text content found.',
      });
    }

    return {
      success: true,
      text: normalizedText,
      fileName,
      mimeType,
      size: buffer.length,
    };
  } catch (error: unknown) {
    return createErrorResponse({
      fileName,
      mimeType,
      size: buffer.length,
      code: 'PARSE_ERROR',
      message: getErrorMessage(error),
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                                   PDF                                      */
/* -------------------------------------------------------------------------- */

async function parsePDF(
  buffer: Buffer
): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

/* -------------------------------------------------------------------------- */
/*                                   DOCX                                     */
/* -------------------------------------------------------------------------- */

async function parseDOCX(
  buffer: Buffer
): Promise<string> {
  const result = await mammoth.extractRawText({
    buffer,
  });

  return result.value || '';
}

/* -------------------------------------------------------------------------- */
/*                                   XLSX                                     */
/* -------------------------------------------------------------------------- */

async function parseXLSX(
  buffer: Buffer
): Promise<string> {
  const rows = (await readXlsxFile(
    buffer
  )) as unknown as ExcelRow[];

  const formattedRows = rows.map(
    (row: ExcelRow) =>
      row
        .map((cell: ExcelCell) => {
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) return cell.toISOString();
          return String(cell);
        })
        .join(' | ')
  );

  return formattedRows.join('\n');
}

/* -------------------------------------------------------------------------- */
/*                                   CSV                                      */
/* -------------------------------------------------------------------------- */

const { parse: parseCSVString } = require('csv-parse/sync');

async function parseCSV(buffer: Buffer): Promise<string> {
  try {
    const text = buffer.toString('utf8');
    const records = parseCSVString(text, {
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    });

    const formattedRows = records.map((row: any[]) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          return String(cell).replace(/\n/g, ' ').trim();
        })
        .join(' | ')
    );

    return formattedRows.join('\n');
  } catch (error) {
    console.error('Error parsing CSV with csv-parse, falling back to raw text:', error);
    return buffer.toString('utf8');
  }
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function validateInput(
  buffer: Buffer,
  fileName: string
): void {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid file buffer.');
  }

  if (buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }

  if (!fileName?.trim()) {
    throw new Error('Missing file name.');
  }
}

function normalizeText(
  text: string
): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown parsing error';
}

function createErrorResponse(params: {
  fileName: string;
  mimeType: string;
  size: number;
  code: string;
  message: string;
}): ParsedFile {
  return {
    success: false,
    text: '',
    fileName: params.fileName,
    mimeType: params.mimeType,
    size: params.size,
    error: {
      code: params.code,
      message: params.message,
    },
  };
}