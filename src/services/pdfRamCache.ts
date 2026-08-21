/**
 * Ultra-Performance In-Memory RAM Cache & Bitmap Engine for PDF Viewing
 * Leverages high-capacity System RAM, GPU ImageBitmap acceleration,
 * Page Dictionary caching, and parallel multi-page prefetching for 0ms response times.
 */

export interface CachedPageBitmap {
  bitmap: ImageBitmap;
  pixelWidth: number;
  pixelHeight: number;
  cssWidth: number;
  cssHeight: number;
  timestamp: number;
}

class PdfUltraRamCacheService {
  // L1 RAM Bitmap Cache (up to 300 high-res pages in system RAM)
  private bitmapCache = new Map<string, CachedPageBitmap>();
  private maxPages = 300;

  // L2 RAM Page Dictionary Cache (keeps parsed page objects warm in RAM)
  private pageProxyCache = new Map<string, any>();

  // Parallel prefetch worker tracker
  private activePrefetchTasks = new Set<string>();

  // Reusable Offscreen Canvas Pool to eliminate allocation GC pauses
  private canvasPool: HTMLCanvasElement[] = [];

  private makeKey(docId: string, pageNumber: number, scale: number): string {
    return `${docId}_p${pageNumber}_s${Math.round(scale * 100)}`;
  }

  private makePageKey(docId: string, pageNumber: number): string {
    return `${docId}_page_${pageNumber}`;
  }

  /**
   * Acquire a clean canvas from the pool or create one
   */
  private acquireCanvas(width: number, height: number): HTMLCanvasElement {
    let canvas = this.canvasPool.pop();
    if (!canvas) {
      canvas = document.createElement('canvas');
    }
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Release canvas back to the reusable pool
   */
  private releaseCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvasPool.length < 8) {
      canvas.width = 1;
      canvas.height = 1;
      this.canvasPool.push(canvas);
    }
  }

  /**
   * Check and retrieve page bitmap directly from RAM in 0ms
   */
  public get(docId: string, pageNumber: number, scale: number): CachedPageBitmap | null {
    const key = this.makeKey(docId, pageNumber, scale);
    const item = this.bitmapCache.get(key);
    if (item) {
      item.timestamp = Date.now();
      return item;
    }
    return null;
  }

  /**
   * Store rendered page bitmap into system RAM
   */
  public set(
    docId: string,
    pageNumber: number,
    scale: number,
    bitmap: ImageBitmap,
    pixelWidth: number,
    pixelHeight: number,
    cssWidth: number,
    cssHeight: number
  ): void {
    const key = this.makeKey(docId, pageNumber, scale);

    // Evict least-recently-used pages if exceeding RAM allocation limit
    if (this.bitmapCache.size >= this.maxPages) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.bitmapCache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const old = this.bitmapCache.get(oldestKey);
        try {
          old?.bitmap.close?.();
        } catch (e) {}
        this.bitmapCache.delete(oldestKey);
      }
    }

    this.bitmapCache.set(key, {
      bitmap,
      pixelWidth,
      pixelHeight,
      cssWidth,
      cssHeight,
      timestamp: Date.now(),
    });
  }

  public has(docId: string, pageNumber: number, scale: number): boolean {
    return this.bitmapCache.has(this.makeKey(docId, pageNumber, scale));
  }

  /**
   * Cached getPage for 0ms page dictionary resolution
   */
  public async getPage(pdfDocProxy: any, docId: string, pageNumber: number): Promise<any> {
    const key = this.makePageKey(docId, pageNumber);
    if (this.pageProxyCache.has(key)) {
      return this.pageProxyCache.get(key);
    }
    const page = await pdfDocProxy.getPage(pageNumber);
    this.pageProxyCache.set(key, page);
    return page;
  }

  /**
   * Parallel Multi-Page Prefetch Engine
   */
  public async prefetchPages(
    docId: string,
    pdfDocProxy: any,
    pageNumbers: number[],
    scale: number
  ): Promise<void> {
    if (!pdfDocProxy) return;

    const filtered = pageNumbers.filter(
      (p) =>
        p >= 1 &&
        p <= pdfDocProxy.numPages &&
        !this.has(docId, p, scale) &&
        !this.activePrefetchTasks.has(this.makeKey(docId, p, scale))
    );

    // Run parallel batches of 3 concurrent worker prefetch tasks
    const batchSize = 3;
    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      await Promise.all(
        batch.map((pageNum) => this.prefetchSinglePage(docId, pdfDocProxy, pageNum, scale))
      );
    }
  }

  private async prefetchSinglePage(
    docId: string,
    pdfDocProxy: any,
    pageNumber: number,
    scale: number
  ): Promise<void> {
    const taskKey = this.makeKey(docId, pageNumber, scale);
    this.activePrefetchTasks.add(taskKey);

    let canvas: HTMLCanvasElement | null = null;
    try {
      const page = await this.getPage(pdfDocProxy, docId, pageNumber);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const pixelViewport = page.getViewport({ scale: scale * dpr });
      const cssViewport = page.getViewport({ scale });

      canvas = this.acquireCanvas(pixelViewport.width, pixelViewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pixelViewport.width, pixelViewport.height);

      const renderContext: any = {
        canvasContext: ctx,
        viewport: pixelViewport,
        intent: 'display',
        background: 'rgb(255, 255, 255)',
      };

      const task = page.render(renderContext);
      await task.promise;

      const bitmap = await createImageBitmap(canvas);
      this.set(
        docId,
        pageNumber,
        scale,
        bitmap,
        pixelViewport.width,
        pixelViewport.height,
        cssViewport.width,
        cssViewport.height
      );
    } catch (e) {
      // Prefetch error handled silently
    } finally {
      if (canvas) {
        this.releaseCanvas(canvas);
      }
      this.activePrefetchTasks.delete(taskKey);
    }
  }

  /**
   * Clear cache for a specific closed document
   */
  public clearDoc(docId: string): void {
    for (const [k, v] of this.bitmapCache.entries()) {
      if (k.startsWith(`${docId}_`)) {
        try {
          v.bitmap.close?.();
        } catch (e) {}
        this.bitmapCache.delete(k);
      }
    }
    for (const k of this.pageProxyCache.keys()) {
      if (k.startsWith(`${docId}_`)) {
        this.pageProxyCache.delete(k);
      }
    }
  }

  /**
   * Clear all caches
   */
  public clearAll(): void {
    for (const v of this.bitmapCache.values()) {
      try {
        v.bitmap.close?.();
      } catch (e) {}
    }
    this.bitmapCache.clear();
    this.pageProxyCache.clear();
    this.activePrefetchTasks.clear();
  }
}

export const pdfRamCache = new PdfUltraRamCacheService();
