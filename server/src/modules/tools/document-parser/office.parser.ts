import { promisify } from 'util';
import { execFile } from 'child_process'; // Changed from exec
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto'; // Added for safe filenames
import type { ParsedDocument, ParseOptions } from './types';

const execFileAsync = promisify(execFile);

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: ParseOptions = {}
): Promise<ParsedDocument> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-'));
  
  const ext = path.extname(fileName);
  const safeFileName = `${crypto.randomUUID()}${ext}`;
  const tempInputPath = path.join(tempDir, safeFileName);
  const tempOutputPath = path.join(tempDir, `${safeFileName}.txt`);

  try {
    await fs.writeFile(tempInputPath, buffer);
    await execFileAsync('officeparser', [
      tempInputPath, 
      '--format', 'txt', 
      '--output', tempOutputPath
    ], { timeout: options.timeoutMs ?? 30000 });

    let text = await fs.readFile(tempOutputPath, 'utf-8');

    const maxLength = options.maxLength ?? 30000;
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + '\n... [truncated]';
    }

    return {
      success: true,
      text,
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
        message: error.message,
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}