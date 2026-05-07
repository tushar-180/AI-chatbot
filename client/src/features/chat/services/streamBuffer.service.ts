type FlushCallback = (accumulatedContent: string) => void;
import { perfMonitor } from "../utils/performance.utils";

export class StreamBufferService {
  private buffer: string = "";
  private pendingFlush: number | null = null;
  private onFlush: FlushCallback | null = null;
  private lastFlushTime: number = 0;
  // Maximum time to wait before forcing a flush (ms)
  private readonly MAX_DELAY = 100;

  constructor(onFlush?: FlushCallback) {
    if (onFlush) {
      this.onFlush = onFlush;
    }
  }

  setFlushCallback(onFlush: FlushCallback) {
    this.onFlush = onFlush;
  }

  /**
   * Determine if the chunk contains characters that indicate a natural break
   * e.g., newline, punctuation mark, or code block boundary.
   */
  private isNaturalBreak(chunk: string): boolean {
    return /[\n.!?:]/.test(chunk) || chunk.includes("```");
  }

  /**
   * Adds a chunk to the buffer and schedules a flush.
   */
  append(chunk: string) {
    this.buffer += chunk;

    const now = performance.now();
    const timeSinceLastFlush = now - this.lastFlushTime;

    // Flush immediately if it's a natural break or we've exceeded the max delay
    if (this.isNaturalBreak(chunk) || timeSinceLastFlush >= this.MAX_DELAY) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.pendingFlush !== null) return;

    this.pendingFlush = requestAnimationFrame(() => {
      this.flush();
    });
  }

  /**
   * Forcefully flushes the current buffer.
   */
  flush() {
    if (this.pendingFlush !== null) {
      cancelAnimationFrame(this.pendingFlush);
      this.pendingFlush = null;
    }

    if (this.buffer.length > 0 && this.onFlush) {
      this.onFlush(this.buffer);
      perfMonitor.trackFlush(this.buffer.length);
      this.buffer = "";
      this.lastFlushTime = performance.now();
    }
  }

  /**
   * Clean up pending animation frames.
   */
  destroy() {
    if (this.pendingFlush !== null) {
      cancelAnimationFrame(this.pendingFlush);
      this.pendingFlush = null;
    }
    this.buffer = "";
    this.onFlush = null;
  }
}
