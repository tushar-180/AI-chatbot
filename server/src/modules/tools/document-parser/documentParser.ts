import type { ParsedDocument, ParseOptions } from './types';

/**
 * Extract text from a document buffer using office-text-extractor.
 * Pure JavaScript – no system dependencies (no LibreOffice, etc.).
 * Works on Render free tier.
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: ParseOptions = {}
): Promise<ParsedDocument> {
  const maxLength = options.maxLength ?? 30000;

  // Dynamic import because office-text-extractor is ESM-only
  const { getTextExtractor } = await import('office-text-extractor');
  const extractor = getTextExtractor();

  try {
    const text = await extractor.extractText({ input: buffer, type: 'buffer' });

    const trimmed = text.trim();
    if (!trimmed) {
      return {
        success: false,
        text: '',
        fileName,
        mimeType,
        size: buffer.length,
        error: {
          code: 'EMPTY_TEXT',
          message: 'No text content could be extracted from the document.',
        },
      };
    }

    const finalText =
      trimmed.length > maxLength
        ? trimmed.slice(0, maxLength) + '\n... [truncated]'
        : trimmed;

    return {
      success: true,
      text: finalText,
      fileName,
      mimeType,
      size: buffer.length,
    };
  } catch (error: any) {
    return {
      success: false,
      text: '',
      fileName,
      mimeType,
      size: buffer.length,
      error: {
        code: 'PARSE_ERROR',
        message: error.message || 'Unknown parsing error',
      },
    };
  }
}