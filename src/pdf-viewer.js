import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Merge adjacent PDF text items on the same horizontal line into a complete, unbroken line
function mergeLineItems(items, viewport) {
  if (!items || items.length === 0) return [];

  const processed = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = item.transform[4];
    const ty = item.transform[5];
    const pt = viewport.convertToViewportPoint(tx, ty);
    const rawFontSize = Math.hypot(item.transform[0], item.transform[1]);
    const fontSize = Math.max(10, rawFontSize * viewport.scale);
    const width = Math.max(8, (item.width || 10) * viewport.scale);

    processed.push({
      item,
      str: item.str,
      tx, ty, pt,
      rawFontSize,
      fontSize,
      width,
      left: pt[0],
      top: pt[1] - fontSize * 0.8,
      right: pt[0] + width,
      fontName: item.fontName
    });
  }

  // Sort by vertical position (Y), then horizontal (X)
  processed.sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > 4) return dy;
    return a.left - b.left;
  });

  const lines = [];
  let currentLine = null;

  for (const p of processed) {
    if (!currentLine) {
      currentLine = { ...p, items: [p] };
      continue;
    }

    const dy = Math.abs(currentLine.top - p.top);
    const dx = p.left - currentLine.right;

    // Dynamic thresholds based on font size:
    const maxDy = Math.max(8, currentLine.fontSize * 0.45);
    const maxDx = Math.max(50, currentLine.fontSize * 1.8);
    const minDx = -Math.max(12, currentLine.fontSize * 0.35);

    // Merge if on same line
    if (dy <= maxDy && dx >= minDx && dx <= maxDx) {
      const needsSpace = dx > 2 && !currentLine.str.endsWith(' ') && !p.str.startsWith(' ');
      currentLine.str += (needsSpace ? ' ' : '') + p.str;
      currentLine.right = Math.max(currentLine.right, p.right);
      currentLine.width = currentLine.right - currentLine.left;
      currentLine.fontSize = Math.max(currentLine.fontSize, p.fontSize);
      currentLine.rawFontSize = Math.max(currentLine.rawFontSize, p.rawFontSize);
      currentLine.items.push(p);
    } else {
      lines.push(currentLine);
      currentLine = { ...p, items: [p] };
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export class PdfViewer {
  constructor(options = {}) {
    this.container = options.container;
    this.thumbnailsContainer = options.thumbnailsContainer;
    this.onPageChange = options.onPageChange || (() => {});
    this.onDocumentLoaded = options.onDocumentLoaded || (() => {});

    this.pdfDoc = null;
    this.originalPdfBytes = null;
    this.totalPages = 0;
    this.currentPage = 1;
    this.scale = 1.0;
    this.pageRotations = {}; // pageIndex -> degrees (0, 90, 180, 270)
    this.deletedPages = new Set();
    this.pageViewports = [];
    this.pageContainers = [];
    this.pageCanvases = [];
    this.renderTasks = [];
    this.isRendering = false;

    this.initScrollListener();
  }

  initScrollListener() {
    if (!this.container) return;
    this.container.addEventListener('scroll', () => {
      this.detectVisiblePage();
    }, { passive: true });
  }

  detectVisiblePage() {
    if (!this.container || this.pageContainers.length === 0) return;
    const containerRect = this.container.getBoundingClientRect();
    const midY = containerRect.top + containerRect.height / 3;

    for (let i = 0; i < this.pageContainers.length; i++) {
      if (this.deletedPages.has(i)) continue;
      const el = this.pageContainers[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= midY && rect.bottom >= midY) {
        if (this.currentPage !== i + 1) {
          this.currentPage = i + 1;
          this.onPageChange(this.currentPage, this.getActivePageCount());
          this.highlightActiveThumbnail(this.currentPage);
        }
        break;
      }
    }
  }

  getActivePageCount() {
    return this.totalPages - this.deletedPages.size;
  }

  async loadDocument(pdfData) {
    // pdfData can be Uint8Array or ArrayBuffer
    if (pdfData instanceof ArrayBuffer) {
      this.originalPdfBytes = new Uint8Array(pdfData);
    } else {
      this.originalPdfBytes = pdfData;
    }

    // Cancel any previous renders
    this.renderTasks.forEach(task => {
      try { task.cancel(); } catch (e) {}
    });
    this.renderTasks = [];

    // Reset state
    this.deletedPages.clear();
    this.pageRotations = {};
    this.currentPage = 1;

    // Load with PDF.js
    const loadingTask = pdfjsLib.getDocument({
      data: this.originalPdfBytes.slice() // pass copy
    });

    this.pdfDoc = await loadingTask.promise;
    this.totalPages = this.pdfDoc.numPages;

    // Render pages
    await this.renderAllPages();
    await this.renderThumbnails();

    this.onDocumentLoaded({
      numPages: this.totalPages,
      currentPage: this.currentPage
    });

    this.highlightActiveThumbnail(1);
  }

  async renderAllPages() {
    if (!this.pdfDoc || !this.container) return;

    this.container.innerHTML = '';
    this.pageContainers = [];
    this.pageCanvases = [];
    this.pageViewports = [];

    const dpr = window.devicePixelRatio || 1;

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const pageIndex = pageNum - 1;
      if (this.deletedPages.has(pageIndex)) continue;

      const page = await this.pdfDoc.getPage(pageNum);
      const extraRot = this.pageRotations[pageIndex] || 0;
      const baseRotation = page.rotate;
      const effectiveRotation = (baseRotation + extraRot) % 360;

      const viewport = page.getViewport({ scale: this.scale, rotation: effectiveRotation });
      this.pageViewports[pageIndex] = viewport;

      // Page wrapper
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.dataset.pageIndex = pageIndex;
      pageWrapper.dataset.pageNum = pageNum;
      pageWrapper.style.width = `${viewport.width}px`;
      pageWrapper.style.height = `${viewport.height}px`;

      // Canvas for PDF content
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-base-canvas';
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // Interactive Text layer for detecting existing PDF text
      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-text-layer';
      textLayer.dataset.pageIndex = pageIndex;
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;

      // Annotation interactive overlay container
      const annotLayer = document.createElement('div');
      annotLayer.className = 'pdf-annotation-layer';
      annotLayer.dataset.pageIndex = pageIndex;
      annotLayer.style.width = `${viewport.width}px`;
      annotLayer.style.height = `${viewport.height}px`;

      pageWrapper.appendChild(canvas);
      pageWrapper.appendChild(textLayer);
      pageWrapper.appendChild(annotLayer);
      this.container.appendChild(pageWrapper);

      this.pageContainers[pageIndex] = pageWrapper;
      this.pageCanvases[pageIndex] = canvas;

      // Render page canvas
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      const task = page.render(renderContext);
      this.renderTasks.push(task);
      await task.promise;

      // Extract existing PDF text items and merge into complete lines
      try {
        const textContent = await page.getTextContent();
        const mergedLines = mergeLineItems(textContent.items, viewport);

        for (const line of mergedLines) {
          const firstItem = line.items[0].item;
          const style = (textContent.styles && textContent.styles[firstItem.fontName]) || {};
          let fontObj = null;
          try {
            if (page.commonObjs && page.commonObjs.has(firstItem.fontName)) {
              fontObj = page.commonObjs.get(firstItem.fontName);
            }
          } catch (e) {}

          const fontLoadedName = (fontObj && fontObj.loadedName) || firstItem.fontName || '';
          const isBold = Boolean(
            (fontObj && (fontObj.bold || fontObj.black)) ||
            /bold|black|heavy|medium|semi|bld|demi|w[6-9]/i.test(fontLoadedName) ||
            /bold|black|heavy|medium|semi|bld|demi|w[6-9]/i.test(firstItem.fontName) ||
            line.rawFontSize >= 13 || // Any title/heading in presentations or documents
            line.fontSize >= 15
          );
          const isItalic = Boolean((fontObj && fontObj.italic) || /italic|oblique/i.test(fontLoadedName));

          let fontFamily = 'sans-serif';
          let cssFont = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
          if (/times|serif/i.test(fontLoadedName) || style.fontFamily === 'serif') {
            fontFamily = 'Times';
            cssFont = '"Times New Roman", Times, Georgia, serif';
          } else if (/courier|mono/i.test(fontLoadedName) || style.fontFamily === 'monospace') {
            fontFamily = 'Courier';
            cssFont = '"Courier New", Courier, monospace';
          }

          const ascent = style.ascent !== undefined ? style.ascent : 0.75;
          const descent = style.descent !== undefined ? style.descent : -0.22;
          const height = Math.max(14, line.fontSize * (ascent - descent));
          const left = line.left;
          const top = line.pt[1] - (line.fontSize * ascent);

          const textEl = document.createElement('div');
          textEl.className = 'pdf-existing-text';
          textEl.dataset.originalText = line.str;
          textEl.dataset.rawFontSize = line.rawFontSize;
          textEl.dataset.fontFamily = fontFamily;
          textEl.dataset.bold = isBold ? 'true' : 'false';
          textEl.dataset.italic = isItalic ? 'true' : 'false';
          textEl.dataset.ascent = ascent;
          textEl.dataset.descent = descent;
          textEl.style.left = `${left}px`;
          textEl.style.top = `${top}px`;
          textEl.style.width = `${line.width + 12}px`;
          textEl.style.height = `${height}px`;
          textEl.style.fontFamily = cssFont;
          textEl.style.fontWeight = isBold ? '700' : '400';
          textEl.style.fontStyle = isItalic ? 'italic' : 'normal';
          textEl.title = `Click to edit: "${line.str}"`;
          textLayer.appendChild(textEl);
        }
      } catch (err) {
        console.warn('Text layer extraction warning:', err);
      }
    }
  }

  async renderThumbnails() {
    if (!this.thumbnailsContainer || !this.pdfDoc) return;
    this.thumbnailsContainer.innerHTML = '';

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const pageIndex = pageNum - 1;
      if (this.deletedPages.has(pageIndex)) continue;

      const thumbItem = document.createElement('div');
      thumbItem.className = 'thumbnail-item';
      thumbItem.dataset.pageNum = pageNum;
      thumbItem.dataset.pageIndex = pageIndex;

      const page = await this.pdfDoc.getPage(pageNum);
      const extraRot = this.pageRotations[pageIndex] || 0;
      const effectiveRotation = (page.rotate + extraRot) % 360;

      // Thumbnail scale ~120px width
      const initialViewport = page.getViewport({ scale: 1, rotation: effectiveRotation });
      const thumbScale = 140 / initialViewport.width;
      const thumbViewport = page.getViewport({ scale: thumbScale, rotation: effectiveRotation });

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'thumbnail-canvas';
      thumbCanvas.width = thumbViewport.width;
      thumbCanvas.height = thumbViewport.height;

      const ctx = thumbCanvas.getContext('2d');
      await page.render({
        canvasContext: ctx,
        viewport: thumbViewport
      }).promise;

      const thumbLabel = document.createElement('div');
      thumbLabel.className = 'thumbnail-label';
      thumbLabel.textContent = `Page ${pageNum}`;

      // Quick action buttons on thumbnail
      const thumbActions = document.createElement('div');
      thumbActions.className = 'thumbnail-actions';
      thumbActions.innerHTML = `
        <button class="thumb-btn rotate-thumb-btn" title="Rotate Page 90°" data-page="${pageIndex}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </button>
        <button class="thumb-btn delete-thumb-btn" title="Delete Page" data-page="${pageIndex}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;

      thumbItem.appendChild(thumbCanvas);
      thumbItem.appendChild(thumbLabel);
      thumbItem.appendChild(thumbActions);

      thumbItem.addEventListener('click', (e) => {
        if (e.target.closest('.thumb-btn')) return;
        this.scrollToPage(pageNum);
      });

      this.thumbnailsContainer.appendChild(thumbItem);
    }
  }

  highlightActiveThumbnail(pageNum) {
    if (!this.thumbnailsContainer) return;
    const allThumbs = this.thumbnailsContainer.querySelectorAll('.thumbnail-item');
    allThumbs.forEach(t => {
      if (parseInt(t.dataset.pageNum, 10) === pageNum) {
        t.classList.add('active');
        t.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        t.classList.remove('active');
      }
    });
  }

  scrollToPage(pageNum) {
    const pageIndex = pageNum - 1;
    const wrapper = this.pageContainers[pageIndex];
    if (wrapper) {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.currentPage = pageNum;
      this.onPageChange(this.currentPage, this.getActivePageCount());
      this.highlightActiveThumbnail(pageNum);
    }
  }

  async setZoom(newScale) {
    if (newScale < 0.25 || newScale > 3.0) return;
    this.scale = newScale;
    await this.renderAllPages();
  }

  async zoomIn() {
    await this.setZoom(Math.min(3.0, this.scale + 0.15));
  }

  async zoomOut() {
    await this.setZoom(Math.max(0.3, this.scale - 0.15));
  }

  async fitToWidth() {
    if (!this.pdfDoc || !this.container) return;
    const page = await this.pdfDoc.getPage(this.currentPage);
    const vp = page.getViewport({ scale: 1 });
    const availableWidth = this.container.clientWidth - 80;
    const targetScale = Math.max(0.4, Math.min(2.5, availableWidth / vp.width));
    await this.setZoom(targetScale);
  }

  async rotateCurrentPage(clockwise = true) {
    const pageIndex = this.currentPage - 1;
    const curRot = this.pageRotations[pageIndex] || 0;
    const delta = clockwise ? 90 : 270;
    this.pageRotations[pageIndex] = (curRot + delta) % 360;
    await this.renderAllPages();
    await this.renderThumbnails();
    this.scrollToPage(this.currentPage);
  }

  async rotatePageByIndex(pageIndex, clockwise = true) {
    const curRot = this.pageRotations[pageIndex] || 0;
    const delta = clockwise ? 90 : 270;
    this.pageRotations[pageIndex] = (curRot + delta) % 360;
    await this.renderAllPages();
    await this.renderThumbnails();
  }

  async deletePageByIndex(pageIndex) {
    if (this.getActivePageCount() <= 1) {
      alert("Cannot delete the only remaining page in the document.");
      return;
    }
    this.deletedPages.add(pageIndex);
    await this.renderAllPages();
    await this.renderThumbnails();
    this.detectVisiblePage();
  }

  getPageAnnotationContainer(pageIndex) {
    const wrapper = this.pageContainers[pageIndex];
    if (!wrapper) return null;
    return wrapper.querySelector('.pdf-annotation-layer');
  }

  getViewport(pageIndex) {
    return this.pageViewports[pageIndex] || null;
  }
}
