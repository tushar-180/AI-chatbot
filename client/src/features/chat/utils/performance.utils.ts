/**
 * Performance instrumentation for development only.
 * Logs render counts and stream flush frequencies.
 */

const isDev = import.meta.env.MODE === "development";

class PerformanceMonitor {
  private renderCounts: Record<string, number> = {};
  private lastRenderTimes: Record<string, number> = {};
  private flushCount: number = 0;
  private lastFlushLogTime: number = performance.now();

  /**
   * Tracks component render frequency and highlights potential excessive renders.
   */
  trackRender(componentName: string) {
    if (!isDev) return;

    this.renderCounts[componentName] = (this.renderCounts[componentName] || 0) + 1;
    const now = performance.now();
    const lastTime = this.lastRenderTimes[componentName] || now;
    
    // Warn if a component is rendering too rapidly (e.g., multiple times under 16ms)
    if (now - lastTime < 16 && now - lastTime > 0) {
      // Uncomment to debug rapid rerenders
      // console.warn(`[Perf] Rapid rerender detected in ${componentName}: ${Math.round(now - lastTime)}ms`);
    }
    
    this.lastRenderTimes[componentName] = now;
  }

  /**
   * Tracks streaming buffer flush events to ensure smooth batching.
   */
  trackFlush(chunkLength: number) {
    if (!isDev) return;

    this.flushCount++;
    const now = performance.now();
    
    // Log flush frequency every 2 seconds
    if (now - this.lastFlushLogTime > 2000) {
      console.log(`[Perf] Stream flushes in last 2s: ${this.flushCount} (Avg chunk len: ${chunkLength})`);
      this.flushCount = 0;
      this.lastFlushLogTime = now;
    }
  }

  /**
   * Used to measure slow synchronous operations like markdown parsing.
   */
  measureTime<T>(label: string, fn: () => T): T {
    if (!isDev) return fn();
    
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    if (duration > 15) { // 15ms is roughly 1 frame
      console.warn(`[Perf] Slow operation detected [${label}]: ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }
}

export const perfMonitor = new PerformanceMonitor();
