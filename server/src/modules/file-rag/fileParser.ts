import path from 'node:path';

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

const DEFAULT_MAX_LENGTH = 30_000;

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.xlsx',
  '.txt',
  '.csv',
]);

export async function parseFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: ParseOptions = {}
): Promise<ParsedFile> {
  const maxLength =
    options.maxLength ?? DEFAULT_MAX_LENGTH;

  try {
    validateInput(buffer, fileName);

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

    switch (extension) {
      case '.pdf':
        extractedText = await parsePDF(buffer);
        break;

      case '.docx':
        extractedText = await parseDOCX(buffer);
        break;

      case '.xlsx':
        extractedText = await parseXLSX(buffer);
        break;

      case '.txt':
      case '.csv':
        extractedText = buffer.toString('utf8');
        break;

      default:
        return createErrorResponse({
          fileName,
          mimeType,
          size: buffer.length,
          code: 'UNSUPPORTED_FILE',
          message: 'Unsupported file type.',
        });
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
      text: truncateText(
        normalizedText,
        maxLength
      ),
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

const { PDFParse } = require('pdf-parse');

async function parsePDF(
  buffer: Buffer
): Promise<string> {
  const p = new PDFParse(new Uint8Array(buffer));
  await p.load();
  const result = await p.getText();

  return result.text || '';
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
  /**
   * read-excel-file typings are inconsistent
   * across versions.
   *
   * Runtime returns row arrays correctly.
   * We normalize the type manually.
   */

  const rows = (await readXlsxFile(
    buffer
  )) as unknown as ExcelRow[];

  const formattedRows = rows.map(
    (row: ExcelRow) =>
      row
        .map((cell: ExcelCell) => {
          if (
            cell === null ||
            cell === undefined
          ) {
            return '';
          }

          if (cell instanceof Date) {
            return cell.toISOString();
          }

          return String(cell);
        })
        .join(' | ')
  );

  return formattedRows.join('\n');
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

function truncateText(
  text: string,
  maxLength: number
): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(
    0,
    maxLength
  )}\n\n... [truncated]`;
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