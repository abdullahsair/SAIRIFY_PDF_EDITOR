import { PdfViewer } from './pdf-viewer.js';
import { AnnotationManager } from './annotation-layer.js';
import { SignatureModal } from './signature-modal.js';
import { exportModifiedPdf, downloadPdfFile } from './pdf-exporter.js';
import { createSamplePdf } from './sample-pdf.js';

class AcrobatStudioApp {
  constructor() {
    this.viewer = null;
    this.annotManager = null;
    this.sigModal = null;
    this.currentDocName = 'sample-agreement.pdf';
    this.currentDocBytes = null;

    this.init();
  }

  async init() {
    // Set up PDF viewer
    this.viewer = new PdfViewer({
      container: document.getElementById('viewerContainer'),
      thumbnailsContainer: document.getElementById('thumbnailsContainer'),
      onPageChange: (pageNum, total) => this.handlePageChange(pageNum, total),
      onDocumentLoaded: (info) => this.handleDocumentLoaded(info)
    });

    // Set up Annotations manager
    this.annotManager = new AnnotationManager({
      viewer: this.viewer,
      onSelectionChange: (item) => this.handleSelectionChange(item),
      onHistoryChange: (state) => this.handleHistoryChange(state)
    });

    // Set up Signature modal
    this.sigModal = new SignatureModal({
      onApply: (dataUrl) => {
        this.annotManager.addSignatureAnnotation(dataUrl);
        this.showToast('Signature placed! Drag or resize to position.', 'success');
      }
    });

    this.bindDomEvents();
    this.bindThumbnailEvents();
    this.bindDragAndDrop();

    // Load initial sample document
    await this.loadSampleDocument();
  }

  async loadSampleDocument() {
    try {
      this.showToast('Generating sample document...', 'info');
      const bytes = await createSamplePdf();
      this.currentDocBytes = bytes;
      this.currentDocName = 'sample-agreement.pdf';
      document.getElementById('docFilename').textContent = this.currentDocName;
      await this.viewer.loadDocument(bytes);
      this.annotManager.annotations.clear();
      this.annotManager.renderAll();
      this.showToast('Ready! You can edit, erase, draw or open any PDF.', 'success');
    } catch (err) {
      console.error('Error loading sample PDF:', err);
      this.showToast('Failed to generate sample PDF', 'error');
    }
  }

  async openPdfFile(file) {
    if (!file) return;
    try {
      this.showToast(`Loading ${file.name}...`, 'info');
      const buffer = await file.arrayBuffer();
      this.currentDocBytes = new Uint8Array(buffer);
      this.currentDocName = file.name;
      document.getElementById('docFilename').textContent = this.currentDocName;
      await this.viewer.loadDocument(this.currentDocBytes);
      this.annotManager.annotations.clear();
      this.annotManager.renderAll();
      this.showToast(`"${file.name}" loaded successfully!`, 'success');
    } catch (err) {
      console.error('Error loading PDF file:', err);
      this.showToast('Failed to open PDF. Ensure it is a valid PDF document.', 'error');
    }
  }

  handlePageChange(pageNum, total) {
    const input = document.getElementById('pageNumberInput');
    const totalEl = document.getElementById('totalPagesText');
    if (input) {
      input.value = pageNum;
      input.max = total;
    }
    if (totalEl) {
      totalEl.textContent = total;
    }
    const badge = document.getElementById('sidebarPageCount');
    if (badge) {
      badge.textContent = `${total} ${total === 1 ? 'Page' : 'Pages'}`;
    }
  }

  handleDocumentLoaded(info) {
    this.handlePageChange(info.currentPage, info.numPages);
    this.annotManager.renderAll();
    this.annotManager.updateCursorMode();
  }

  handleHistoryChange(state) {
    document.getElementById('undoBtn').disabled = !state.canUndo;
    document.getElementById('redoBtn').disabled = !state.canRedo;
  }

  handleSelectionChange(item) {
    const contextBar = document.getElementById('contextBar');
    const selGroup = document.getElementById('selectionContextGroup');
    const deleteBtn = document.getElementById('deleteItemBtn');

    if (!item) {
      selGroup.style.display = 'none';
      deleteBtn.style.display = 'none';
      this.updateActiveToolContext(this.annotManager.currentTool);
      return;
    }

    deleteBtn.style.display = 'inline-flex';
    selGroup.style.display = 'flex';
    document.getElementById('selectionLabel').textContent = `Selected: ${item.type.toUpperCase()}`;

    // If item is text, show text properties
    if (item.type === 'text') {
      document.getElementById('textContextGroup').style.display = 'flex';
      document.getElementById('fontSizeSelect').value = item.fontSize || 14;
      document.getElementById('fontFamilySelect').value = item.fontFamily || 'Helvetica';
      document.getElementById('textColorPicker').value = item.color || '#000000';
      document.getElementById('boldToggleBtn').classList.toggle('active', !!item.bold);
      document.getElementById('italicToggleBtn').classList.toggle('active', !!item.italic);
    }
  }

  updateActiveToolContext(tool) {
    const hintGroup = document.getElementById('hintContextGroup');
    const hintText = document.getElementById('contextHintText');

    // Hide all tool-specific context groups
    document.getElementById('textContextGroup').style.display = 'none';
    document.getElementById('penContextGroup').style.display = 'none';
    document.getElementById('highlighterContextGroup').style.display = 'none';
    document.getElementById('shapesContextGroup').style.display = 'none';

    if (tool === 'text') {
      if (hintGroup) hintGroup.style.display = 'none';
      document.getElementById('textContextGroup').style.display = 'flex';
    } else if (tool === 'pen') {
      if (hintGroup) hintGroup.style.display = 'none';
      document.getElementById('penContextGroup').style.display = 'flex';
    } else if (tool === 'highlighter') {
      if (hintGroup) hintGroup.style.display = 'none';
      document.getElementById('highlighterContextGroup').style.display = 'flex';
    } else if (tool === 'shape') {
      if (hintGroup) hintGroup.style.display = 'none';
      document.getElementById('shapesContextGroup').style.display = 'flex';
    } else {
      if (hintGroup) {
        hintGroup.style.display = 'flex';
        if (tool === 'whiteout') {
          hintText.innerHTML = '🔲 <strong>Whiteout Tool:</strong> Click & drag over existing text to erase and replace it.';
        } else if (tool === 'redact') {
          hintText.innerHTML = '⬛ <strong>Redact Tool:</strong> Click & drag over sensitive information to blackout permanently.';
        } else if (tool === 'hand') {
          hintText.innerHTML = '✋ <strong>Hand Tool:</strong> Click & drag to pan smoothly through document pages.';
        } else {
          hintText.innerHTML = '↖️ <strong>Select Tool:</strong> Click elements to move/resize • Double-click text to edit • Press Delete to remove';
        }
      }
    }
  }

  bindDomEvents() {
    // File inputs & Open buttons
    const fileInput = document.getElementById('pdfFileInput');
    document.getElementById('openPdfBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.openPdfFile(file);
      fileInput.value = '';
    });

    document.getElementById('samplePdfBtn').addEventListener('click', () => this.loadSampleDocument());

    // Print
    document.getElementById('printBtn').addEventListener('click', () => {
      window.print();
    });

    // Download / Export
    document.getElementById('downloadPdfBtn').addEventListener('click', () => this.handleDownloadPdf());

    // Zoom buttons
    document.getElementById('zoomInBtn').addEventListener('click', async () => {
      await this.viewer.zoomIn();
      this.updateZoomDisplay();
      this.annotManager.renderAll();
    });
    document.getElementById('zoomOutBtn').addEventListener('click', async () => {
      await this.viewer.zoomOut();
      this.updateZoomDisplay();
      this.annotManager.renderAll();
    });
    document.getElementById('fitWidthBtn').addEventListener('click', async () => {
      await this.viewer.fitToWidth();
      this.updateZoomDisplay();
      this.annotManager.renderAll();
    });
    document.getElementById('zoomLevelBtn').addEventListener('click', async () => {
      await this.viewer.setZoom(1.0);
      this.updateZoomDisplay();
      this.annotManager.renderAll();
    });

    // Page navigation
    document.getElementById('prevPageBtn').addEventListener('click', () => {
      if (this.viewer.currentPage > 1) {
        this.viewer.scrollToPage(this.viewer.currentPage - 1);
      }
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
      if (this.viewer.currentPage < this.viewer.getActivePageCount()) {
        this.viewer.scrollToPage(this.viewer.currentPage + 1);
      }
    });
    document.getElementById('pageNumberInput').addEventListener('change', (e) => {
      const pageNum = parseInt(e.target.value, 10);
      if (pageNum >= 1 && pageNum <= this.viewer.getActivePageCount()) {
        this.viewer.scrollToPage(pageNum);
      }
    });

    // Toggle Sidebar
    document.getElementById('toggleSidebarBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // Main Tool buttons
    const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.annotManager.setTool(tool);
        this.updateActiveToolContext(tool);
      });
    });

    // Shape dropdown menu
    const shapeBtn = document.getElementById('shapeToolBtn');
    const shapeMenu = document.getElementById('shapeDropdownMenu');
    const shapeWrapper = shapeBtn.closest('.dropdown-wrapper');

    shapeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      shapeWrapper.classList.toggle('open');
    });

    shapeMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const shape = item.dataset.shape;
        this.annotManager.updateToolSetting('shapeType', shape);
        document.getElementById('activeShapeLabel').textContent = item.textContent.split(' ')[1];
        shapeWrapper.classList.remove('open');
        this.annotManager.setTool('shape');
        toolBtns.forEach(b => b.classList.remove('active'));
        shapeBtn.classList.add('active');
        this.updateActiveToolContext('shape');
      });
    });

    // Stamp dropdown menu
    const stampBtn = document.getElementById('stampMenuBtn');
    const stampMenu = document.getElementById('stampDropdownMenu');
    const stampWrapper = stampBtn.closest('.dropdown-wrapper');

    stampBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stampWrapper.classList.toggle('open');
    });

    stampMenu.querySelectorAll('.stamp-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const text = opt.dataset.stamp;
        const color = opt.dataset.color;
        this.annotManager.addStampAnnotation(text, color);
        stampWrapper.classList.remove('open');
        this.showToast(`Stamped "${text}" on page`, 'success');
      });
    });

    // Close dropdowns on outside click
    window.addEventListener('click', () => {
      shapeWrapper.classList.remove('open');
      stampWrapper.classList.remove('open');
    });

    // Signature Modal open button
    document.getElementById('openSigModalBtn').addEventListener('click', () => {
      this.sigModal.open();
    });

    // Image Upload
    const imgInput = document.getElementById('imageUploadInput');
    document.getElementById('insertImageBtn').addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            this.annotManager.addImageAnnotation(evt.target.result, img.naturalWidth, img.naturalHeight);
            this.showToast('Image inserted!', 'success');
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
      imgInput.value = '';
    });

    // Page Actions (Rotate / Delete)
    document.getElementById('rotatePageBtn').addEventListener('click', async () => {
      await this.viewer.rotateCurrentPage(true);
      this.annotManager.renderAll();
      this.showToast(`Rotated page ${this.viewer.currentPage} 90°`, 'info');
    });

    document.getElementById('deletePageBtn').addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete Page ${this.viewer.currentPage}?`)) {
        await this.viewer.deletePageByIndex(this.viewer.currentPage - 1);
        this.annotManager.renderAll();
        this.showToast('Page deleted.', 'info');
      }
    });

    // Undo / Redo
    document.getElementById('undoBtn').addEventListener('click', () => this.annotManager.undo());
    document.getElementById('redoBtn').addEventListener('click', () => this.annotManager.redo());

    // Delete item
    document.getElementById('deleteItemBtn').addEventListener('click', () => this.annotManager.deleteSelected());
    document.getElementById('deleteSelectionBtn').addEventListener('click', () => this.annotManager.deleteSelected());
    document.getElementById('duplicateItemBtn').addEventListener('click', () => this.annotManager.duplicateSelected());

    // Text options context bar bindings
    document.getElementById('fontFamilySelect').addEventListener('change', (e) => {
      this.annotManager.updateToolSetting('fontFamily', e.target.value);
    });
    document.getElementById('fontSizeSelect').addEventListener('change', (e) => {
      this.annotManager.updateToolSetting('fontSize', parseInt(e.target.value, 10));
    });
    document.getElementById('textColorPicker').addEventListener('input', (e) => {
      this.annotManager.updateToolSetting('textColor', e.target.value);
    });
    document.getElementById('boldToggleBtn').addEventListener('click', (e) => {
      const active = e.currentTarget.classList.toggle('active');
      this.annotManager.updateToolSetting('bold', active);
    });
    document.getElementById('italicToggleBtn').addEventListener('click', (e) => {
      const active = e.currentTarget.classList.toggle('active');
      this.annotManager.updateToolSetting('italic', active);
    });

    // Pen swatches & thickness
    document.querySelectorAll('#penContextGroup .palette-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('#penContextGroup .palette-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        this.annotManager.updateToolSetting('penColor', sw.dataset.color);
      });
    });
    document.getElementById('penWidthSelect').addEventListener('change', (e) => {
      this.annotManager.updateToolSetting('penWidth', parseFloat(e.target.value));
    });

    // Highlighter swatches
    document.querySelectorAll('#highlighterContextGroup .palette-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('#highlighterContextGroup .palette-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        this.annotManager.updateToolSetting('highlightColor', sw.dataset.color);
      });
    });

    // Shapes stroke/fill
    document.getElementById('shapeStrokeColorPicker').addEventListener('input', (e) => {
      this.annotManager.updateToolSetting('strokeColor', e.target.value);
    });
    document.getElementById('shapeStrokeWidthSelect').addEventListener('change', (e) => {
      this.annotManager.updateToolSetting('strokeWidth', parseInt(e.target.value, 10));
    });
    document.getElementById('shapeFillSelect').addEventListener('change', (e) => {
      this.annotManager.updateToolSetting('fillColor', e.target.value);
    });
  }

  bindThumbnailEvents() {
    const thumbsContainer = document.getElementById('thumbnailsContainer');
    thumbsContainer.addEventListener('click', async (e) => {
      const rotateBtn = e.target.closest('.rotate-thumb-btn');
      if (rotateBtn) {
        const pageIdx = parseInt(rotateBtn.dataset.page, 10);
        await this.viewer.rotatePageByIndex(pageIdx, true);
        this.annotManager.renderAll();
        return;
      }

      const delBtn = e.target.closest('.delete-thumb-btn');
      if (delBtn) {
        const pageIdx = parseInt(delBtn.dataset.page, 10);
        if (confirm(`Delete Page ${pageIdx + 1}?`)) {
          await this.viewer.deletePageByIndex(pageIdx);
          this.annotManager.renderAll();
        }
      }
    });
  }

  bindDragAndDrop() {
    const overlay = document.getElementById('dropOverlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          this.openPdfFile(file);
        } else {
          this.showToast('Please drop a valid .pdf file.', 'error');
        }
      }
    });
  }

  updateZoomDisplay() {
    const pct = Math.round(this.viewer.scale * 100);
    document.getElementById('zoomLevelBtn').textContent = `${pct}%`;
  }

  async handleDownloadPdf() {
    if (!this.currentDocBytes) {
      this.showToast('No PDF loaded to export.', 'error');
      return;
    }

    try {
      this.showToast('Generating high-fidelity PDF with your edits...', 'info');

      const finalPdfBytes = await exportModifiedPdf({
        originalPdfBytes: this.currentDocBytes,
        pageAnnotations: this.annotManager.getAllAnnotationsMap(),
        pageRotations: this.viewer.pageRotations,
        deletedPages: this.viewer.deletedPages
      });

      const exportName = this.currentDocName.replace(/\.pdf$/i, '') + '_edited.pdf';
      downloadPdfFile(finalPdfBytes, exportName);

      this.showToast(`Downloaded "${exportName}" successfully!`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      this.showToast('Error exporting PDF document. Check console for details.', 'error');
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    } else {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AcrobatStudioApp();
});
