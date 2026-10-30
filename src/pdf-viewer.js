import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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

      // Annotation interactive overlay container
      const annotLayer = document.createElement('div');
      annotLayer.className = 'pdf-annotation-layer';
      annotLayer.dataset.pageIndex = pageIndex;
      annotLayer.style.width = `${viewport.width}px`;
      annotLayer.style.height = `${viewport.height}px`;

      pageWrapper.appendChild(canvas);
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
