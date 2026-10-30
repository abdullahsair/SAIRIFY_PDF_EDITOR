/**
 * Signature Modal for Adobe Acrobat style signature capture
 */
export class SignatureModal {
  constructor(options = {}) {
    this.onApply = options.onApply || (() => {});
    this.modalEl = null;
    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.lastPoint = null;
    this.inkColor = '#0d47a1'; // Professional blue ink default
    this.mode = 'draw'; // 'draw' or 'type'

    this.createDom();
  }

  createDom() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop signature-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            <span>Create Digital Signature</span>
          </div>
          <button class="modal-close-btn" title="Close">&times;</button>
        </div>

        <div class="signature-tabs">
          <button class="tab-btn active" data-tab="draw">Draw Signature</button>
          <button class="tab-btn" data-tab="type">Type Signature</button>
        </div>

        <div class="modal-body">
          <!-- Draw View -->
          <div class="sig-view sig-draw-view">
            <div class="canvas-wrapper">
              <canvas class="sig-pad-canvas" width="500" height="180"></canvas>
              <div class="sig-baseline"></div>
              <span class="sig-pad-hint">Sign here with mouse, pen, or touch</span>
            </div>
          </div>

          <!-- Type View -->
          <div class="sig-view sig-type-view" style="display: none;">
            <input type="text" class="sig-name-input" placeholder="Type your full name here..." maxlength="40" />
            <div class="sig-preview-card">
              <div class="sig-preview-text cursive-1">Signature Preview</div>
            </div>
          </div>

          <!-- Controls: Color & Clear -->
          <div class="sig-controls">
            <div class="color-picker-group">
              <span class="label">Ink Color:</span>
              <button class="color-choice active" data-color="#0d47a1" style="background: #0d47a1;" title="Blue Ink"></button>
              <button class="color-choice" data-color="#111827" style="background: #111827;" title="Black Ink"></button>
            </div>
            <button class="btn btn-secondary sig-clear-btn">Clear</button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary cancel-btn">Cancel</button>
          <button class="btn btn-primary apply-sig-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Apply Signature</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    this.canvas = modal.querySelector('.sig-pad-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.bindEvents();
  }

  bindEvents() {
    const modal = this.modalEl;
    modal.querySelector('.modal-close-btn').addEventListener('click', () => this.close());
    modal.querySelector('.cancel-btn').addEventListener('click', () => this.close());
    modal.querySelector('.sig-clear-btn').addEventListener('click', () => this.clear());
    modal.querySelector('.apply-sig-btn').addEventListener('click', () => this.apply());

    // Switch tabs
    const tabs = modal.querySelectorAll('.tab-btn');
    const drawView = modal.querySelector('.sig-draw-view');
    const typeView = modal.querySelector('.sig-type-view');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.mode = tab.dataset.tab;
        if (this.mode === 'draw') {
          drawView.style.display = 'block';
          typeView.style.display = 'none';
        } else {
          drawView.style.display = 'none';
          typeView.style.display = 'block';
          const input = modal.querySelector('.sig-name-input');
          input.focus();
        }
      });
    });

    // Type signature input
    const nameInput = modal.querySelector('.sig-name-input');
    const previewText = modal.querySelector('.sig-preview-text');
    nameInput.addEventListener('input', () => {
      previewText.textContent = nameInput.value.trim() || 'Signature Preview';
    });

    // Color choices
    const colorChoices = modal.querySelectorAll('.color-choice');
    colorChoices.forEach(btn => {
      btn.addEventListener('click', () => {
        colorChoices.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.inkColor = btn.dataset.color;
        previewText.style.color = this.inkColor;
      });
    });

    // Canvas drawing
    const canvas = this.canvas;
    const ctx = this.ctx;

    const startDraw = (x, y) => {
      this.isDrawing = true;
      this.lastPoint = { x, y };
      modal.querySelector('.sig-pad-hint').style.display = 'none';
    };

    const draw = (x, y) => {
      if (!this.isDrawing || !this.lastPoint) return;
      ctx.beginPath();
      ctx.strokeStyle = this.inkColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      this.lastPoint = { x, y };
    };

    const stopDraw = () => {
      this.isDrawing = false;
      this.lastPoint = null;
    };

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      startDraw(e.clientX - rect.left, e.clientY - rect.top);
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      draw(e.clientX - rect.left, e.clientY - rect.top);
    });
    window.addEventListener('mouseup', stopDraw);

    // Touch support for tablets / touch screens
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      startDraw(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      draw(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });

    canvas.addEventListener('touchend', stopDraw);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.modalEl.querySelector('.sig-pad-hint').style.display = 'block';
    const input = this.modalEl.querySelector('.sig-name-input');
    input.value = '';
    this.modalEl.querySelector('.sig-preview-text').textContent = 'Signature Preview';
  }

  open() {
    this.clear();
    this.modalEl.style.display = 'flex';
  }

  close() {
    this.modalEl.style.display = 'none';
  }

  apply() {
    if (this.mode === 'draw') {
      const dataUrl = this.canvas.toDataURL('image/png');
      this.onApply(dataUrl);
    } else {
      // Type signature mode: render typed text onto a canvas
      const input = this.modalEl.querySelector('.sig-name-input');
      const text = input.value.trim() || 'Signature';

      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = 400;
      renderCanvas.height = 120;
      const rCtx = renderCanvas.getContext('2d');

      rCtx.fillStyle = this.inkColor;
      rCtx.font = 'italic 52px "Dancing Script", "Caveat", "Brush Script MT", cursive';
      rCtx.textAlign = 'center';
      rCtx.textBaseline = 'middle';
      rCtx.fillText(text, 200, 60);

      const dataUrl = renderCanvas.toDataURL('image/png');
      this.onApply(dataUrl);
    }
    this.close();
  }
}
