/**
 * Annotation & Editing Layer for PDF Studio Pro
 * Handles text boxes, whiteout/erasers, redaction, drawing, highlighter, shapes, signatures & stamps
 */

export class AnnotationManager {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.onHistoryChange = options.onHistoryChange || (() => {});

    // Active tool settings
    this.currentTool = 'select'; // 'hand', 'select', 'text', 'pen', 'highlighter', 'whiteout', 'redact', 'shape'
    this.toolSettings = {
      fontFamily: 'Helvetica',
      fontSize: 14,
      textColor: '#000000',
      bold: false,
      italic: false,
      penColor: '#e5252a',
      penWidth: 3,
      highlightColor: '#ffe066',
      highlightOpacity: 0.4,
      shapeType: 'rectangle', // 'rectangle', 'circle', 'line', 'arrow'
      strokeColor: '#2563eb',
      strokeWidth: 2,
      fillColor: 'transparent',
      whiteoutColor: '#ffffff',
      redactColor: '#000000'
    };

    // Annotations map: pageIndex -> Array of annotation objects
    this.annotations = new Map();
    // History stack for undo/redo
    this.historyStack = [];
    this.redoStack = [];

    // Interaction states
    this.selectedItem = null;
    this.selectedPageIndex = null;
    this.isDrawing = false;
    this.activeDrawingPoints = [];
    this.drawingCanvas = null;
    this.drawingCtx = null;
    this.dragState = null;
    this.resizeState = null;

    this.bindEvents();
  }

  setTool(tool) {
    this.currentTool = tool;
    this.clearSelection();
    this.updateCursorMode();
  }

  updateToolSetting(key, value) {
    this.toolSettings[key] = value;
    if (this.selectedItem && this.selectedItem.type === 'text') {
      if (['fontSize', 'fontFamily', 'textColor', 'bold', 'italic'].includes(key)) {
        if (key === 'textColor') this.selectedItem.color = value;
        else this.selectedItem[key] = value;
        this.renderAll();
      }
    } else if (this.selectedItem && this.selectedItem.type === 'shape') {
      if (['strokeColor', 'strokeWidth', 'fillColor'].includes(key)) {
        this.selectedItem[key] = value;
        this.renderAll();
      }
    }
  }

  updateCursorMode() {
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    wrappers.forEach(w => {
      w.classList.remove('cursor-hand', 'cursor-draw', 'cursor-text', 'cursor-crosshair');
      if (this.currentTool === 'hand') w.classList.add('cursor-hand');
      else if (['pen', 'highlighter'].includes(this.currentTool)) w.classList.add('cursor-draw');
      else if (this.currentTool === 'text') w.classList.add('cursor-text');
      else if (['whiteout', 'redact', 'shape'].includes(this.currentTool)) w.classList.add('cursor-crosshair');
    });
  }

  getAnnotationsForPage(pageIndex) {
    if (!this.annotations.has(pageIndex)) {
      this.annotations.set(pageIndex, []);
    }
    return this.annotations.get(pageIndex);
  }

  getAllAnnotationsMap() {
    const map = {};
    for (const [pageIndex, list] of this.annotations.entries()) {
      map[pageIndex] = list;
    }
    return map;
  }

  pushHistory(actionDescription = 'Edit') {
    // Deep clone annotations snapshot
    const snapshot = {};
    for (const [pageIndex, list] of this.annotations.entries()) {
      snapshot[pageIndex] = JSON.parse(JSON.stringify(list));
    }
    this.historyStack.push({ snapshot, desc: actionDescription });
    if (this.historyStack.length > 50) this.historyStack.shift();
    this.redoStack = [];
    this.onHistoryChange({ canUndo: this.historyStack.length > 0, canRedo: false });
  }

  undo() {
    if (this.historyStack.length === 0) return;
    const currentSnapshot = {};
    for (const [pageIndex, list] of this.annotations.entries()) {
      currentSnapshot[pageIndex] = JSON.parse(JSON.stringify(list));
    }
    this.redoStack.push({ snapshot: currentSnapshot });

    const previous = this.historyStack.pop();
    this.annotations.clear();
    for (const pageIdx in previous.snapshot) {
      this.annotations.set(parseInt(pageIdx, 10), previous.snapshot[pageIdx]);
    }
    this.clearSelection();
    this.renderAll();
    this.onHistoryChange({ canUndo: this.historyStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const currentSnapshot = {};
    for (const [pageIndex, list] of this.annotations.entries()) {
      currentSnapshot[pageIndex] = JSON.parse(JSON.stringify(list));
    }
    this.historyStack.push({ snapshot: currentSnapshot });

    const next = this.redoStack.pop();
    this.annotations.clear();
    for (const pageIdx in next.snapshot) {
      this.annotations.set(parseInt(pageIdx, 10), next.snapshot[pageIdx]);
    }
    this.clearSelection();
    this.renderAll();
    this.onHistoryChange({ canUndo: this.historyStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  bindEvents() {
    const container = this.viewer.container;
    if (!container) return;

    container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedItem) {
          e.preventDefault();
          this.deleteSelected();
        }
      } else if (e.key === 'Escape') {
        this.clearSelection();
        this.setTool('select');
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        if (this.selectedItem) {
          e.preventDefault();
          this.duplicateSelected();
        }
      }
    });
  }

  getPageCoords(e, pageWrapper) {
    const rect = pageWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      x: Math.max(0, Math.min(rect.width, x)),
      y: Math.max(0, Math.min(rect.height, y)),
      pageWidth: rect.width,
      pageHeight: rect.height
    };
  }

  handleMouseDown(e) {
    if (this.currentTool === 'hand') return;

    // Check if clicked inside a page wrapper
    const pageWrapper = e.target.closest('.pdf-page-wrapper');
    if (!pageWrapper) {
      this.clearSelection();
      return;
    }

    const pageIndex = parseInt(pageWrapper.dataset.pageIndex, 10);
    const coords = this.getPageCoords(e, pageWrapper);

    // Check if clicked on a resize handle
    if (e.target.classList.contains('resize-handle')) {
      const handleType = e.target.dataset.handle;
      this.resizeState = {
        item: this.selectedItem,
        pageIndex: this.selectedPageIndex,
        handleType,
        startX: coords.x,
        startY: coords.y,
        origX: this.selectedItem.x,
        origY: this.selectedItem.y,
        origW: this.selectedItem.width,
        origH: this.selectedItem.height
      };
      return;
    }

    // Check if clicked directly on an existing annotation element
    const annotElement = e.target.closest('.annot-item');
    if (annotElement && this.currentTool === 'select') {
      const id = annotElement.dataset.id;
      const pageAnnots = this.getAnnotationsForPage(pageIndex);
      const item = pageAnnots.find(a => a.id === id);
      if (item) {
        this.selectItem(item, pageIndex);

        // If clicking inside the text content, allow text editing without moving
        const isTextDiv = e.target.classList.contains('annot-text-content') || e.target.closest('.annot-text-content');
        if (isTextDiv) {
          const textDiv = annotElement.querySelector('.annot-text-content');
          if (textDiv) {
            textDiv.contentEditable = 'true';
            textDiv.focus();
          }
        } else {
          // If clicking on element border/handle, allow moving
          this.dragState = {
            item,
            pageIndex,
            startX: coords.x,
            startY: coords.y,
            origX: item.x,
            origY: item.y
          };
        }
        return;
      }
    }

    // Check if clicked on an existing PDF text element to edit it directly!
    const existingTextEl = e.target.closest('.pdf-existing-text');
    if (existingTextEl && (this.currentTool === 'select' || this.currentTool === 'text')) {
      const text = existingTextEl.dataset.originalText;
      const left = parseFloat(existingTextEl.style.left);
      const top = parseFloat(existingTextEl.style.top);
      const width = parseFloat(existingTextEl.style.width);
      const height = parseFloat(existingTextEl.style.height);
      const fontSize = Math.round(parseFloat(existingTextEl.dataset.rawFontSize) || 14);

      this.convertExistingTextToEditable(pageIndex, text, left, top, width, height, fontSize, existingTextEl);
      return;
    }

    // If tool is 'select' and clicked empty space -> clear selection
    if (this.currentTool === 'select') {
      this.clearSelection();
      return;
    }

    // Creating new annotation based on active tool
    if (this.currentTool === 'text') {
      this.pushHistory('Add Text');
      this.createTextAnnotation(coords.x, coords.y, pageIndex, coords.pageWidth, coords.pageHeight);
    } 
    else if (this.currentTool === 'pen' || this.currentTool === 'highlighter') {
      this.isDrawing = true;
      this.activePageIndex = pageIndex;
      this.activePageWidth = coords.pageWidth;
      this.activePageHeight = coords.pageHeight;
      this.activeDrawingPoints = [{ x: coords.x, y: coords.y }];

      this.createTempDrawingCanvas(pageWrapper, coords.pageWidth, coords.pageHeight);
    }
    else if (['whiteout', 'redact', 'shape'].includes(this.currentTool)) {
      this.isCreatingShape = true;
      this.shapeStartX = coords.x;
      this.shapeStartY = coords.y;
      this.activePageIndex = pageIndex;
      this.activePageWidth = coords.pageWidth;
      this.activePageHeight = coords.pageHeight;

      this.createTempShapePreview(pageWrapper, coords.x, coords.y);
    }
  }

  handleMouseMove(e) {
    if (this.resizeState) {
      const pageWrapper = this.viewer.pageContainers[this.resizeState.pageIndex];
      if (!pageWrapper) return;
      const coords = this.getPageCoords(e, pageWrapper);
      const dx = coords.x - this.resizeState.startX;
      const dy = coords.y - this.resizeState.startY;

      const item = this.resizeState.item;
      const orig = this.resizeState;

      if (orig.handleType === 'se') {
        item.width = Math.max(20, orig.origW + dx);
        item.height = Math.max(16, orig.origH + dy);
      } else if (orig.handleType === 'sw') {
        item.x = orig.origX + dx;
        item.width = Math.max(20, orig.origW - dx);
        item.height = Math.max(16, orig.origH + dy);
      } else if (orig.handleType === 'ne') {
        item.y = orig.origY + dy;
        item.width = Math.max(20, orig.origW + dx);
        item.height = Math.max(16, orig.origH - dy);
      } else if (orig.handleType === 'nw') {
        item.x = orig.origX + dx;
        item.y = orig.origY + dy;
        item.width = Math.max(20, orig.origW - dx);
        item.height = Math.max(16, orig.origH - dy);
      }

      this.renderPageAnnotations(this.resizeState.pageIndex);
      return;
    }

    if (this.dragState) {
      const pageWrapper = this.viewer.pageContainers[this.dragState.pageIndex];
      if (!pageWrapper) return;
      const coords = this.getPageCoords(e, pageWrapper);
      const dx = coords.x - this.dragState.startX;
      const dy = coords.y - this.dragState.startY;

      this.dragState.item.x = Math.max(0, this.dragState.origX + dx);
      this.dragState.item.y = Math.max(0, this.dragState.origY + dy);

      this.renderPageAnnotations(this.dragState.pageIndex);
      return;
    }

    if (this.isDrawing && this.drawingCtx) {
      const pageWrapper = this.viewer.pageContainers[this.activePageIndex];
      if (!pageWrapper) return;
      const coords = this.getPageCoords(e, pageWrapper);
      this.activeDrawingPoints.push({ x: coords.x, y: coords.y });

      const ctx = this.drawingCtx;
      const pts = this.activeDrawingPoints;
      ctx.clearRect(0, 0, this.activePageWidth, this.activePageHeight);

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (this.currentTool === 'highlighter') {
        ctx.strokeStyle = this.toolSettings.highlightColor;
        ctx.lineWidth = 18;
        ctx.globalAlpha = this.toolSettings.highlightOpacity;
      } else {
        ctx.strokeStyle = this.toolSettings.penColor;
        ctx.lineWidth = this.toolSettings.penWidth;
        ctx.globalAlpha = 1.0;
      }

      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }
      return;
    }

    if (this.isCreatingShape && this.tempShapeEl) {
      const pageWrapper = this.viewer.pageContainers[this.activePageIndex];
      if (!pageWrapper) return;
      const coords = this.getPageCoords(e, pageWrapper);

      const x = Math.min(this.shapeStartX, coords.x);
      const y = Math.min(this.shapeStartY, coords.y);
      const w = Math.abs(coords.x - this.shapeStartX);
      const h = Math.abs(coords.y - this.shapeStartY);

      this.tempShapeEl.style.left = `${x}px`;
      this.tempShapeEl.style.top = `${y}px`;
      this.tempShapeEl.style.width = `${w}px`;
      this.tempShapeEl.style.height = `${h}px`;
    }
  }

  handleMouseUp(e) {
    if (this.resizeState) {
      this.pushHistory('Resize');
      this.resizeState = null;
    }

    if (this.dragState) {
      this.pushHistory('Move');
      this.dragState = null;
    }

    if (this.isDrawing) {
      this.isDrawing = false;
      this.finalizeDrawing();
    }

    if (this.isCreatingShape) {
      this.isCreatingShape = false;
      this.finalizeShape(e);
    }
  }

  createTempDrawingCanvas(pageWrapper, width, height) {
    if (this.tempCanvas) {
      this.tempCanvas.remove();
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'temp-drawing-canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '50';

    pageWrapper.appendChild(canvas);
    this.tempCanvas = canvas;
    this.drawingCtx = canvas.getContext('2d');
  }

  finalizeDrawing() {
    if (!this.tempCanvas || this.activeDrawingPoints.length < 2) {
      if (this.tempCanvas) this.tempCanvas.remove();
      this.tempCanvas = null;
      this.drawingCtx = null;
      return;
    }

    // Convert temp canvas to PNG data URL
    const dataUrl = this.tempCanvas.toDataURL('image/png');
    this.tempCanvas.remove();
    this.tempCanvas = null;
    this.drawingCtx = null;

    this.pushHistory('Freehand Draw');

    const annot = {
      id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'raster-layer',
      x: 0,
      y: 0,
      width: this.activePageWidth,
      height: this.activePageHeight,
      pageRenderWidth: this.activePageWidth,
      pageRenderHeight: this.activePageHeight,
      dataUrl: dataUrl,
      opacity: 1
    };

    const list = this.getAnnotationsForPage(this.activePageIndex);
    list.push(annot);
    this.renderPageAnnotations(this.activePageIndex);
  }

  createTempShapePreview(pageWrapper, x, y) {
    if (this.tempShapeEl) this.tempShapeEl.remove();

    const div = document.createElement('div');
    div.className = 'temp-shape-preview';
    div.style.position = 'absolute';
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.width = '0px';
    div.style.height = '0px';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '50';

    if (this.currentTool === 'whiteout') {
      div.style.backgroundColor = '#ffffff';
      div.style.border = '1px dashed #999';
    } else if (this.currentTool === 'redact') {
      div.style.backgroundColor = '#000000';
    } else if (this.currentTool === 'shape') {
      div.style.border = `${this.toolSettings.strokeWidth}px solid ${this.toolSettings.strokeColor}`;
      div.style.backgroundColor = this.toolSettings.fillColor || 'transparent';
      if (this.toolSettings.shapeType === 'circle') {
        div.style.borderRadius = '50%';
      }
    }

    pageWrapper.appendChild(div);
    this.tempShapeEl = div;
  }

  finalizeShape(e) {
    if (!this.tempShapeEl) return;
    const pageWrapper = this.viewer.pageContainers[this.activePageIndex];
    const coords = pageWrapper ? this.getPageCoords(e, pageWrapper) : { x: this.shapeStartX, y: this.shapeStartY };

    const x = Math.min(this.shapeStartX, coords.x);
    const y = Math.min(this.shapeStartY, coords.y);
    const w = Math.abs(coords.x - this.shapeStartX);
    const h = Math.abs(coords.y - this.shapeStartY);

    this.tempShapeEl.remove();
    this.tempShapeEl = null;

    if (w < 5 && h < 5) return; // Ignore accidental clicks

    this.pushHistory(`Add ${this.currentTool}`);

    let annot;
    if (this.currentTool === 'whiteout') {
      annot = {
        id: 'whiteout_' + Date.now(),
        type: 'whiteout',
        x, y, width: w, height: h,
        pageRenderWidth: this.activePageWidth,
        pageRenderHeight: this.activePageHeight
      };
    } else if (this.currentTool === 'redact') {
      annot = {
        id: 'redact_' + Date.now(),
        type: 'redact',
        x, y, width: w, height: h,
        pageRenderWidth: this.activePageWidth,
        pageRenderHeight: this.activePageHeight
      };
    } else if (this.currentTool === 'shape') {
      annot = {
        id: 'shape_' + Date.now(),
        type: 'shape',
        shapeType: this.toolSettings.shapeType,
        x, y, width: w, height: h,
        startX: this.shapeStartX,
        startY: this.shapeStartY,
        endX: coords.x,
        endY: coords.y,
        strokeColor: this.toolSettings.strokeColor,
        strokeWidth: this.toolSettings.strokeWidth,
        fillColor: this.toolSettings.fillColor,
        pageRenderWidth: this.activePageWidth,
        pageRenderHeight: this.activePageHeight
      };
    }

    if (annot) {
      const list = this.getAnnotationsForPage(this.activePageIndex);
      list.push(annot);
      this.renderPageAnnotations(this.activePageIndex);
      this.selectItem(annot, this.activePageIndex);
    }

    // Switch back to select tool for ease of use
    this.setTool('select');
  }

  createTextAnnotation(x, y, pageIndex, pageWidth, pageHeight) {
    const annot = {
      id: 'text_' + Date.now(),
      type: 'text',
      x: x,
      y: y,
      width: 180,
      height: 36,
      text: 'Click to edit text',
      fontFamily: this.toolSettings.fontFamily,
      fontSize: this.toolSettings.fontSize,
      color: this.toolSettings.textColor,
      bold: this.toolSettings.bold,
      italic: this.toolSettings.italic,
      pageRenderWidth: pageWidth,
      pageRenderHeight: pageHeight
    };

    const list = this.getAnnotationsForPage(pageIndex);
    list.push(annot);
    this.renderPageAnnotations(pageIndex);
    this.selectItem(annot, pageIndex);
    this.setTool('select');

    // Automatically focus text editing
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${annot.id}"] .annot-text-content`);
      if (el) {
        el.focus();
        document.execCommand('selectAll', false, null);
      }
    }, 50);
  }

  addSignatureAnnotation(dataUrl, width = 160, height = 70) {
    const pageIndex = this.viewer.currentPage - 1;
    const pageWrapper = this.viewer.pageContainers[pageIndex];
    if (!pageWrapper) return;

    const rect = pageWrapper.getBoundingClientRect();
    const x = Math.max(20, (rect.width - width) / 2);
    const y = Math.max(20, (rect.height - height) / 2);

    this.pushHistory('Add Signature');

    const annot = {
      id: 'sig_' + Date.now(),
      type: 'signature',
      x, y, width, height,
      dataUrl,
      pageRenderWidth: rect.width,
      pageRenderHeight: rect.height
    };

    const list = this.getAnnotationsForPage(pageIndex);
    list.push(annot);
    this.renderPageAnnotations(pageIndex);
    this.selectItem(annot, pageIndex);
    this.setTool('select');
  }

  addStampAnnotation(text, color = '#E5252A') {
    // Generate an authentic angled stamp image on a canvas
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-10 * Math.PI / 180); // 10 degree tilt

    // Stamp border
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(-95, -30, 190, 60);

    // Inner dashed border
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-90, -25, 180, 50);

    // Stamp text
    ctx.fillStyle = color;
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 0, 0);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    this.addSignatureAnnotation(dataUrl, 180, 70);
  }

  addImageAnnotation(dataUrl, naturalWidth = 200, naturalHeight = 150) {
    const pageIndex = this.viewer.currentPage - 1;
    const pageWrapper = this.viewer.pageContainers[pageIndex];
    if (!pageWrapper) return;

    const rect = pageWrapper.getBoundingClientRect();
    let width = 180;
    let height = (naturalHeight / naturalWidth) * width;
    if (height > 300) {
      height = 200;
      width = (naturalWidth / naturalHeight) * height;
    }

    const x = Math.max(20, (rect.width - width) / 2);
    const y = Math.max(20, (rect.height - height) / 2);

    this.pushHistory('Add Image');

    const annot = {
      id: 'img_' + Date.now(),
      type: 'image',
      x, y, width, height,
      dataUrl,
      pageRenderWidth: rect.width,
      pageRenderHeight: rect.height
    };

    const list = this.getAnnotationsForPage(pageIndex);
    list.push(annot);
    this.renderPageAnnotations(pageIndex);
    this.selectItem(annot, pageIndex);
    this.setTool('select');
  }

  selectItem(item, pageIndex) {
    this.selectedItem = item;
    this.selectedPageIndex = pageIndex;
    this.updateDomSelection(pageIndex);
    this.onSelectionChange(item);
  }

  updateDomSelection(pageIndex) {
    // Remove selection styling from all other items across all pages
    document.querySelectorAll('.annot-item.selected').forEach(el => {
      if (!this.selectedItem || el.dataset.id !== this.selectedItem.id) {
        el.classList.remove('selected');
        el.querySelectorAll('.resize-handle').forEach(h => h.remove());
        const txt = el.querySelector('.annot-text-content');
        if (txt) txt.contentEditable = 'false';
      }
    });

    if (!this.selectedItem || this.selectedPageIndex === null) return;

    const annotLayer = this.viewer.getPageAnnotationContainer(pageIndex);
    if (!annotLayer) return;

    let el = annotLayer.querySelector(`[data-id="${this.selectedItem.id}"]`);
    if (!el) {
      this.renderPageAnnotations(pageIndex);
      el = annotLayer.querySelector(`[data-id="${this.selectedItem.id}"]`);
      if (!el) return;
    }

    el.classList.add('selected');

    if (this.selectedItem.type === 'text') {
      const textDiv = el.querySelector('.annot-text-content');
      if (textDiv) {
        textDiv.contentEditable = 'true';
      }
    }

    // Add handles if not present
    if (this.selectedItem.type !== 'raster-layer' && !el.querySelector('.resize-handle')) {
      const handles = ['nw', 'ne', 'se', 'sw'];
      handles.forEach(h => {
        const handle = document.createElement('div');
        handle.className = `resize-handle handle-${h}`;
        handle.dataset.handle = h;
        el.appendChild(handle);
      });
    }
  }

  clearSelection() {
    if (this.selectedItem && this.selectedPageIndex !== null) {
      document.querySelectorAll('.annot-item.selected').forEach(el => {
        el.classList.remove('selected');
        el.querySelectorAll('.resize-handle').forEach(h => h.remove());
        const txt = el.querySelector('.annot-text-content');
        if (txt) txt.contentEditable = 'false';
      });
      this.selectedItem = null;
      this.selectedPageIndex = null;
      this.onSelectionChange(null);
    }
  }

  sampleCanvasColors(canvas, left, top, width, height) {
    if (!canvas) return { bgColor: '#ffffff', textColor: '#000000' };
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const dpr = canvas.width / (canvas.clientWidth || parseInt(canvas.style.width, 10) || 1);

      // 1. Sample Background Color: 4px to the left of the text, middle vertical
      const bgX = Math.max(1, Math.round((left - 4) * dpr));
      const bgY = Math.max(1, Math.round((top + height * 0.5) * dpr));
      const bgPixel = ctx.getImageData(bgX, bgY, 1, 1).data;

      let bgColor = '#ffffff';
      if (bgPixel[3] > 10) {
        bgColor = '#' + [bgPixel[0], bgPixel[1], bgPixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
      }

      // 2. Sample Text Color: Scan across character strokes to find ink with contrast to background
      const scanStartX = Math.max(0, Math.round(left * dpr));
      const scanWidth = Math.min(Math.round(width * dpr), Math.round(60 * dpr));
      const scanStartY = Math.max(0, Math.round(top * dpr));
      const scanHeight = Math.max(1, Math.round(height * dpr));

      const imgData = ctx.getImageData(scanStartX, scanStartY, Math.max(1, scanWidth), scanHeight).data;
      let maxDist = 0;
      let bestR = 0, bestG = 0, bestB = 0;

      for (let i = 0; i < imgData.length; i += 4) {
        if (imgData[i + 3] < 50) continue; // skip transparent
        const dist = Math.hypot(
          imgData[i] - bgPixel[0],
          imgData[i + 1] - bgPixel[1],
          imgData[i + 2] - bgPixel[2]
        );
        if (dist > maxDist) {
          maxDist = dist;
          bestR = imgData[i];
          bestG = imgData[i + 1];
          bestB = imgData[i + 2];
        }
      }

      let textColor = '#000000';
      if (maxDist > 45) {
        textColor = '#' + [bestR, bestG, bestB].map(x => x.toString(16).padStart(2, '0')).join('');
      }

      return { bgColor, textColor };
    } catch (err) {
      console.warn('Canvas color sampling warning:', err);
      return { bgColor: '#ffffff', textColor: '#000000' };
    }
  }

  convertExistingTextToEditable(pageIndex, text, left, top, width, height, fontSize, targetEl) {
    this.pushHistory(`Edit text: ${text.substring(0, 16)}`);

    if (targetEl) {
      targetEl.style.display = 'none';
    }

    const pageWrapper = this.viewer.pageContainers[pageIndex];
    const pageWidth = pageWrapper ? pageWrapper.clientWidth : 800;
    const pageHeight = pageWrapper ? pageWrapper.clientHeight : 1100;
    const canvas = this.viewer.pageCanvases[pageIndex];

    // Detect exact section background color and text color from canvas pixels!
    const { bgColor, textColor } = this.sampleCanvasColors(canvas, left, top, width, height);

    // Detect font family, weight, italic, and baseline alignment
    const fontFamily = (targetEl && targetEl.dataset.fontFamily) || 'Helvetica';
    const rawFontSize = (targetEl && parseFloat(targetEl.dataset.rawFontSize)) || fontSize;
    const isHeading = rawFontSize >= 13 || fontSize >= 15;
    const bold = (targetEl && targetEl.dataset.bold === 'true') || isHeading;
    const italic = (targetEl && targetEl.dataset.italic === 'true') || false;
    const ascent = (targetEl && parseFloat(targetEl.dataset.ascent)) || 0.75;
    const descent = (targetEl && parseFloat(targetEl.dataset.descent)) || -0.22;

    // 1. Invisible mask box matching EXACT canvas background color (NO white rectangle!)
    const mask = {
      id: 'mask_auto_' + Date.now(),
      type: 'whiteout',
      isAutoMask: true,
      maskColor: bgColor, // Matches exact section background!
      x: Math.max(0, left - 2),
      y: Math.max(0, top - 2),
      width: Math.max(width + 12, 40),
      height: height + 4,
      pageRenderWidth: pageWidth,
      pageRenderHeight: pageHeight
    };

    // 2. Live editable text box matching original text color, font, size, weight, and position
    const textAnnot = {
      id: 'text_' + Date.now(),
      type: 'text',
      x: left,
      y: top,
      width: Math.max(width + 16, 40),
      height: height,
      text: text,
      fontFamily: fontFamily,
      fontSize: fontSize,
      color: textColor, // Matches original text color (RED stays RED, etc.)
      bold: bold,
      italic: italic,
      ascent: ascent,
      descent: descent,
      pageRenderWidth: pageWidth,
      pageRenderHeight: pageHeight
    };

    const list = this.getAnnotationsForPage(pageIndex);
    list.push(mask);
    list.push(textAnnot);

    this.renderPageAnnotations(pageIndex);
    this.selectItem(textAnnot, pageIndex);
    this.setTool('select');

    setTimeout(() => {
      const annotLayer = this.viewer.getPageAnnotationContainer(pageIndex);
      if (annotLayer) {
        const textDiv = annotLayer.querySelector(`[data-id="${textAnnot.id}"] .annot-text-content`);
        if (textDiv) {
          textDiv.focus();
          document.execCommand('selectAll', false, null);
        }
      }
    }, 50);

    if (window.app && window.app.showToast) {
      window.app.showToast('Text format & original colors preserved!', 'success');
    }
  }

  deleteSelected() {
    if (!this.selectedItem || this.selectedPageIndex === null) return;
    this.pushHistory('Delete Item');
    const list = this.getAnnotationsForPage(this.selectedPageIndex);
    const idx = list.findIndex(a => a.id === this.selectedItem.id);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
    const pIdx = this.selectedPageIndex;
    this.clearSelection();
    this.renderPageAnnotations(pIdx);
  }

  duplicateSelected() {
    if (!this.selectedItem || this.selectedPageIndex === null) return;
    this.pushHistory('Duplicate Item');
    const clone = JSON.parse(JSON.stringify(this.selectedItem));
    clone.id = clone.type + '_' + Date.now();
    clone.x += 20;
    clone.y += 20;

    const list = this.getAnnotationsForPage(this.selectedPageIndex);
    list.push(clone);
    this.renderPageAnnotations(this.selectedPageIndex);
    this.selectItem(clone, this.selectedPageIndex);
  }

  renderAll() {
    for (let i = 0; i < this.viewer.totalPages; i++) {
      this.renderPageAnnotations(i);
    }
  }

  renderPageAnnotations(pageIndex) {
    const annotLayer = this.viewer.getPageAnnotationContainer(pageIndex);
    if (!annotLayer) return;

    annotLayer.innerHTML = '';
    const list = this.getAnnotationsForPage(pageIndex);

    for (const item of list) {
      const isSelected = this.selectedItem && this.selectedItem.id === item.id;
      const el = document.createElement('div');
      el.className = `annot-item annot-${item.type} ${isSelected ? 'selected' : ''}`;
      el.dataset.id = item.id;
      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
      el.style.width = `${item.width}px`;
      el.style.height = `${item.height}px`;

      if (item.type === 'whiteout') {
        el.style.backgroundColor = item.maskColor || '#ffffff';
        if (item.isAutoMask) {
          el.className += ' annot-auto-mask';
          el.style.boxShadow = 'none';
          el.style.outline = 'none';
          el.style.pointerEvents = 'none';
        } else {
          el.style.boxShadow = isSelected ? '0 0 0 1.5px #E5252A' : 'none';
        }
      } 
      else if (item.type === 'redact') {
        el.style.backgroundColor = '#000000';
      }
      else if (item.type === 'shape') {
        el.style.border = `${item.strokeWidth || 2}px solid ${item.strokeColor || '#2563eb'}`;
        el.style.backgroundColor = item.fillColor || 'transparent';
        if (item.shapeType === 'circle') {
          el.style.borderRadius = '50%';
        }
      }
      else if (item.type === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'annot-text-content';
        textDiv.contentEditable = isSelected ? 'true' : 'false';
        textDiv.innerText = item.text || '';
        textDiv.style.fontSize = `${item.fontSize || 14}px`;
        textDiv.style.fontFamily = item.fontFamily === 'Times' 
          ? '"Times New Roman", Times, Georgia, serif' 
          : item.fontFamily === 'Courier' 
          ? '"Courier New", Courier, monospace' 
          : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        textDiv.style.color = item.color || '#000000';
        textDiv.style.fontWeight = item.bold ? '700' : '400';
        textDiv.style.fontStyle = item.italic ? 'italic' : 'normal';
        textDiv.style.lineHeight = '1.15';
        textDiv.style.whiteSpace = 'nowrap';
        textDiv.style.wordBreak = 'normal';
        textDiv.style.margin = '0';
        textDiv.style.padding = '0 2px';

        // Auto-fit wrapper width
        el.style.width = 'auto';
        el.style.minWidth = `${item.width}px`;

        textDiv.addEventListener('input', () => {
          item.text = textDiv.innerText;
        });

        textDiv.addEventListener('blur', () => {
          this.pushHistory('Edit Text Content');
        });

        el.appendChild(textDiv);
      }
      else if (item.type === 'raster-layer' || item.type === 'signature' || item.type === 'image' || item.type === 'stamp') {
        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.draggable = false;
        el.appendChild(img);
      }

      // Add selection outline and resize handles if selected
      if (isSelected && item.type !== 'raster-layer') {
        const handles = ['nw', 'ne', 'se', 'sw'];
        handles.forEach(h => {
          const handle = document.createElement('div');
          handle.className = `resize-handle handle-${h}`;
          handle.dataset.handle = h;
          el.appendChild(handle);
        });
      }

      annotLayer.appendChild(el);
    }
  }
}
