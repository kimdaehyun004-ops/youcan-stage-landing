/* PDF 렌더링 (pdf.js 번들 내장 — 행사장 인터넷 없이도 동작) */

const BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
let lib = null;

export async function loadPdfjs() {
  if (lib) return lib;
  lib = await import(BASE + 'build/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = BASE + 'build/pdf.worker.min.mjs';
  return lib;
}

export async function openPdf(url) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    url,
    cMapUrl: BASE + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: BASE + 'standard_fonts/',
    wasmUrl: BASE + 'wasm/',
    iccUrl: BASE + 'iccs/',
    enableHWA: true,
  }).promise;
}

/** 캔버스 하나에 "현재 페이지"를 꽉 차게(contain) 그리는 렌더러 */
export class SlideRenderer {
  constructor(canvas, { maxDpr = 2 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.maxDpr = maxDpr;
    this.doc = null;
    this.pageCache = new Map();
    this.task = null;
    this.current = 0;
    this.lastGood = 0;
  }

  setDoc(doc) {
    this.doc = doc;
    this.pageCache.clear();
    this.current = 0;
    this.lastGood = 0;
  }

  async page(n) {
    if (!this.doc) return null;
    if (n < 1 || n > this.doc.numPages) return null;
    if (!this.pageCache.has(n)) this.pageCache.set(n, await this.doc.getPage(n));
    return this.pageCache.get(n);
  }

  /** 렌더. 같은 페이지 재요청/리사이즈에도 안전하게 직전 작업을 취소한다. */
  async render(n, boxW, boxH) {
    if (!this.doc || !boxW || !boxH) return;
    const page = await this.page(n);
    if (!page) return;

    if (this.task) { try { this.task.cancel(); } catch (_) {} this.task = null; }

    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(boxW / base.width, boxH / base.height);
    const viewport = page.getViewport({ scale: scale * dpr });

    const cw = Math.max(1, Math.round(viewport.width));
    const chh = Math.max(1, Math.round(viewport.height));
    if (this.canvas.width !== cw || this.canvas.height !== chh) {
      this.canvas.width = cw;
      this.canvas.height = chh;
    }
    this.canvas.style.width = Math.round(cw / dpr) + 'px';
    this.canvas.style.height = Math.round(chh / dpr) + 'px';

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, cw, chh);

    this.task = page.render({ canvasContext: this.ctx, viewport });
    try {
      await this.task.promise;
      this.current = n;
      this.lastGood = n;
    } catch (err) {
      if (err && err.name !== 'RenderingCancelledException') throw err;
    } finally {
      this.task = null;
    }
    // 다음 장 미리 불러두기 (넘길 때 멈춤 방지)
    this.page(n + 1).catch(() => {});
  }
}

/** 썸네일 1장을 dataURL로 (컨트롤 콘솔 그리드/다음 장 미리보기용) */
export async function renderThumb(doc, n, targetW = 220) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = targetW / base.width;
  const viewport = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(viewport.width));
  c.height = Math.max(1, Math.round(viewport.height));
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return c.toDataURL('image/jpeg', 0.72);
}
