/**
 * SnapFull Studio - Screenshot Editor & Annotation Engine
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM References
  const docTitle = document.getElementById('doc-title');
  const docDims = document.getElementById('doc-dims');
  const docUrl = document.getElementById('doc-url');

  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const btnZoom100 = document.getElementById('btn-zoom-100');
  const zoomLevelText = document.getElementById('zoom-level');

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear-annotations');

  const btnCopyClipboard = document.getElementById('btn-copy-clipboard');
  const btnExportDropdown = document.getElementById('btn-export-dropdown');
  const exportMenu = document.getElementById('export-menu');
  const exportPng = document.getElementById('export-png');
  const exportJpg = document.getElementById('export-jpg');
  const exportPdfSingle = document.getElementById('export-pdf-single');
  const exportPdfA4 = document.getElementById('export-pdf-a4');
  const btnPrint = document.getElementById('btn-print');

  const canvasViewport = document.getElementById('canvas-viewport');
  const canvasStage = document.getElementById('canvas-stage');
  const mainCanvas = document.getElementById('main-canvas');
  const annotationCanvas = document.getElementById('annotation-canvas');
  const mainCtx = mainCanvas.getContext('2d');
  const annotCtx = annotationCanvas.getContext('2d');

  const cropOverlay = document.getElementById('crop-overlay');
  const cropBox = document.getElementById('crop-box');
  const cropDims = document.getElementById('crop-dims');
  const btnApplyCrop = document.getElementById('btn-apply-crop');
  const btnCancelCrop = document.getElementById('btn-cancel-crop');
  const groupCropActions = document.getElementById('group-crop-actions');
  const groupStrokeWidth = document.getElementById('group-stroke-width');
  const groupFontSize = document.getElementById('group-font-size');
  const selectFontSize = document.getElementById('select-font-size');

  const colorPalette = document.getElementById('color-palette');
  const customColorPicker = document.getElementById('custom-color-picker');
  const widthGroup = document.getElementById('width-group');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  // Application State
  let currentScreenshot = null;
  let baseImage = new Image();
  let currentZoom = 1.0;
  let activeTool = 'pan'; // pan, crop, rectangle, circle, arrow, line, pen, highlighter, text, badge, blur
  let currentColor = '#f43f5e';
  let currentStrokeWidth = 4;
  let currentFontSize = 22;
  let nextBadgeNumber = 1;

  // History Stacks
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 30;

  // Drawing Interaction State
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentFreehandPoints = [];

  // Panning State
  let isSpacePressed = false;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let scrollStartX = 0;
  let scrollStartY = 0;

  // Crop State
  let cropRect = { x: 0, y: 0, w: 0, h: 0 };
  let isResizingCrop = false;
  let isMovingCrop = false;
  let activeCropHandle = null;
  let cropDragStart = { x: 0, y: 0, rect: null };

  // 1. Initialize & Load Screenshot
  const urlParams = new URLSearchParams(window.location.search);
  const screenshotId = urlParams.get('id');

  if (!screenshotId) {
    showToast('No screenshot ID provided in URL', 4000);
  } else {
    await loadScreenshot(screenshotId);
  }

  async function loadScreenshot(id) {
    let data = null;
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'GET_SCREENSHOT', id });
      if (resp && resp.success && resp.data) {
        data = resp.data;
      }
    } catch (e) {
      console.warn('Failed to query background via message:', e);
    }

    if (!data && typeof SnapDB !== 'undefined') {
      try {
        data = await SnapDB.getScreenshot(id);
      } catch (e) {
        console.warn('SnapDB fetch failed:', e);
      }
    }

    if (!data) {
      try {
        const storageKey = `snapfull_item_${id}`;
        const local = await chrome.storage.local.get([storageKey]);
        data = local[storageKey];
      } catch (e) {}
    }

    if (!data || !data.dataUrl) {
      showToast('Could not load screenshot data', 4000);
      return;
    }

    currentScreenshot = data;
    docTitle.textContent = data.title || 'Screenshot';
    document.title = `SnapFull - ${data.title || 'Screenshot'}`;

    if (data.url) {
      docUrl.textContent = data.url;
      docUrl.href = data.url;
    } else {
      docUrl.style.display = 'none';
    }

    baseImage.onload = () => {
      initCanvasDimensions(baseImage.width, baseImage.height);
      mainCtx.drawImage(baseImage, 0, 0);
      saveState(); // Initial state
      autoFitZoom();
    };
    baseImage.src = data.dataUrl;
  }

  function initCanvasDimensions(width, height) {
    mainCanvas.width = width;
    mainCanvas.height = height;
    annotationCanvas.width = width;
    annotationCanvas.height = height;

    canvasStage.style.width = `${width}px`;
    canvasStage.style.height = `${height}px`;

    docDims.textContent = `${width} × ${height} px`;
  }

  // 2. State & History Management
  function saveState() {
    // Snapshot main canvas + annotation canvas merged
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mainCanvas.width;
    tempCanvas.height = mainCanvas.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(mainCanvas, 0, 0);
    tCtx.drawImage(annotationCanvas, 0, 0);

    undoStack.push({
      width: mainCanvas.width,
      height: mainCanvas.height,
      dataUrl: tempCanvas.toDataURL('image/png'),
      badgeNumber: nextBadgeNumber
    });

    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }

    redoStack.length = 0; // Clear redo
    updateHistoryButtons();
  }

  function restoreState(state) {
    const img = new Image();
    img.onload = () => {
      initCanvasDimensions(state.width, state.height);
      mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      mainCtx.drawImage(img, 0, 0);
      annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
      nextBadgeNumber = state.badgeNumber || 1;
      updateCropBoxToCanvas();
    };
    img.src = state.dataUrl;
  }

  function undo() {
    if (undoStack.length <= 1) return;
    const currentState = undoStack.pop();
    redoStack.push(currentState);
    const prevState = undoStack[undoStack.length - 1];
    restoreState(prevState);
    updateHistoryButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    restoreState(nextState);
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    btnUndo.disabled = undoStack.length <= 1;
    btnRedo.disabled = redoStack.length === 0;
  }

  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);

  btnClear.addEventListener('click', () => {
    annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    saveState();
    showToast('Annotations cleared');
  });

  // 3. Zoom & Pan Controls
  function setZoom(factor) {
    currentZoom = Math.max(0.1, Math.min(3.0, factor));
    canvasStage.style.transform = `scale(${currentZoom})`;
    zoomLevelText.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  function autoFitZoom() {
    const vpW = canvasViewport.clientWidth - 80;
    const vpH = canvasViewport.clientHeight - 120;
    const fitW = vpW / mainCanvas.width;
    const fitH = vpH / mainCanvas.height;
    const fit = Math.min(fitW, fitH, 1.0);
    setZoom(fit);
  }

  btnZoomIn.addEventListener('click', () => setZoom(currentZoom + 0.15));
  btnZoomOut.addEventListener('click', () => setZoom(currentZoom - 0.15));
  btnZoomFit.addEventListener('click', autoFitZoom);
  btnZoom100.addEventListener('click', () => setZoom(1.0));

  // Wheel Zoom & Space Pan
  canvasViewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom(currentZoom + delta);
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isSpacePressed && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      isSpacePressed = true;
      canvasViewport.classList.add('panning');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      if (activeTool !== 'pan') {
        canvasViewport.classList.remove('panning');
      }
    }
  });

  canvasViewport.addEventListener('mousedown', (e) => {
    if (activeTool === 'pan' || isSpacePressed || e.button === 1) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      scrollStartX = canvasViewport.scrollLeft;
      scrollStartY = canvasViewport.scrollTop;
      canvasViewport.classList.add('panning');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      canvasViewport.scrollLeft = scrollStartX - dx;
      canvasViewport.scrollTop = scrollStartY - dy;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      if (activeTool !== 'pan' && !isSpacePressed) {
        canvasViewport.classList.remove('panning');
      }
    }
  });

  // 4. Tool Selection & Properties
  const toolButtons = document.querySelectorAll('.tool-btn');
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      selectTool(tool);
    });
  });

  function selectTool(tool) {
    activeTool = tool;
    toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));

    // Handle Pan cursor
    if (tool === 'pan') {
      canvasViewport.classList.add('panning');
    } else {
      canvasViewport.classList.remove('panning');
    }

    // Handle Crop Overlay
    if (tool === 'crop') {
      initCropBox();
      cropOverlay.classList.remove('hidden');
      groupCropActions.classList.remove('hidden');
      groupStrokeWidth.classList.add('hidden');
      groupFontSize.classList.add('hidden');
    } else {
      cropOverlay.classList.add('hidden');
      groupCropActions.classList.add('hidden');
      groupStrokeWidth.classList.remove('hidden');

      if (tool === 'text') {
        groupFontSize.classList.remove('hidden');
      } else {
        groupFontSize.classList.add('hidden');
      }
    }
  }

  // Color Palette Selection
  colorPalette.addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    colorPalette.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    currentColor = dot.dataset.color;
  });

  customColorPicker.addEventListener('input', (e) => {
    colorPalette.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    currentColor = e.target.value;
  });

  // Stroke Width Selector
  widthGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.width-btn');
    if (!btn) return;
    widthGroup.querySelectorAll('.width-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStrokeWidth = parseInt(btn.dataset.width, 10);
  });

  // Font Size
  selectFontSize.addEventListener('change', (e) => {
    currentFontSize = parseInt(e.target.value, 10);
  });

  // 5. Canvas Drawing Engine
  function getCanvasCoordinates(e) {
    const rect = annotationCanvas.getBoundingClientRect();
    const scaleX = annotationCanvas.width / rect.width;
    const scaleY = annotationCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  annotationCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || activeTool === 'pan' || isSpacePressed || activeTool === 'crop') return;

    const coords = getCanvasCoordinates(e);
    isDrawing = true;
    startX = coords.x;
    startY = coords.y;

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      currentFreehandPoints = [{ x: startX, y: startY }];
    }

    if (activeTool === 'badge') {
      drawStepBadge(mainCtx, startX, startY, nextBadgeNumber, currentColor);
      nextBadgeNumber++;
      saveState();
      isDrawing = false;
    }

    if (activeTool === 'text') {
      promptTextInput(coords.x, coords.y);
      isDrawing = false;
    }
  });

  annotationCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoordinates(e);

    annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

    switch (activeTool) {
      case 'rectangle':
        drawRect(annotCtx, startX, startY, coords.x - startX, coords.y - startY, currentColor, currentStrokeWidth);
        break;

      case 'circle':
        drawEllipse(annotCtx, startX, startY, coords.x, coords.y, currentColor, currentStrokeWidth);
        break;

      case 'arrow':
        drawArrow(annotCtx, startX, startY, coords.x, coords.y, currentColor, currentStrokeWidth);
        break;

      case 'line':
        drawLine(annotCtx, startX, startY, coords.x, coords.y, currentColor, currentStrokeWidth);
        break;

      case 'pen':
        currentFreehandPoints.push({ x: coords.x, y: coords.y });
        drawFreehand(annotCtx, currentFreehandPoints, currentColor, currentStrokeWidth, false);
        break;

      case 'highlighter':
        currentFreehandPoints.push({ x: coords.x, y: coords.y });
        drawFreehand(annotCtx, currentFreehandPoints, currentColor, currentStrokeWidth * 3, true);
        break;

      case 'blur':
        drawBlurPreview(annotCtx, startX, startY, coords.x - startX, coords.y - startY);
        break;

      default:
        break;
    }
  });

  annotationCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const coords = getCanvasCoordinates(e);

    annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

    switch (activeTool) {
      case 'rectangle':
        drawRect(mainCtx, startX, startY, coords.x - startX, coords.y - startY, currentColor, currentStrokeWidth);
        saveState();
        break;

      case 'circle':
        drawEllipse(mainCtx, startX, startY, coords.x, coords.y, currentColor, currentStrokeWidth);
        saveState();
        break;

      case 'arrow':
        drawArrow(mainCtx, startX, startY, coords.x, coords.y, currentColor, currentStrokeWidth);
        saveState();
        break;

      case 'line':
        drawLine(mainCtx, startX, startY, coords.x, coords.y, currentColor, currentStrokeWidth);
        saveState();
        break;

      case 'pen':
        drawFreehand(mainCtx, currentFreehandPoints, currentColor, currentStrokeWidth, false);
        currentFreehandPoints = [];
        saveState();
        break;

      case 'highlighter':
        drawFreehand(mainCtx, currentFreehandPoints, currentColor, currentStrokeWidth * 3, true);
        currentFreehandPoints = [];
        saveState();
        break;

      case 'blur':
        applyPixelateBlur(mainCtx, startX, startY, coords.x - startX, coords.y - startY, 14);
        saveState();
        break;

      default:
        break;
    }
  });

  // Drawing Primitives
  function drawRect(ctx, x, y, w, h, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawEllipse(ctx, x1, y1, x2, y2, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const cx = Math.min(x1, x2) + rx;
    const cy = Math.min(y1, y2) + ry;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawLine(ctx, x1, y1, x2, y2, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawArrow(ctx, fromX, fromY, toX, toY, color, width) {
    const headLength = Math.max(16, width * 3.5);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Main line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - (headLength * 0.7) * Math.cos(angle), toY - (headLength * 0.7) * Math.sin(angle));
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawFreehand(ctx, points, color, width, isHighlighter) {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isHighlighter) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color === '#ffffff' ? '#facc15' : color;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const midX = (points[i - 1].x + points[i].x) / 2;
      const midY = (points[i - 1].y + points[i].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, midX, midY);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawStepBadge(ctx, x, y, number, color) {
    const radius = 16;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y + 1);
    ctx.restore();
  }

  function promptTextInput(canvasX, canvasY) {
    const text = prompt('Enter annotation text:');
    if (!text || text.trim() === '') return;

    mainCtx.save();
    mainCtx.font = `bold ${currentFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    
    // Background tag pill
    const metrics = mainCtx.measureText(text);
    const paddingX = 8;
    const paddingY = 5;
    const textHeight = currentFontSize;
    const boxW = metrics.width + (paddingX * 2);
    const boxH = textHeight + (paddingY * 2);

    mainCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    mainCtx.strokeStyle = currentColor;
    mainCtx.lineWidth = 2;
    mainCtx.beginPath();
    roundRect(mainCtx, canvasX - paddingX, canvasY - textHeight, boxW, boxH, 6);
    mainCtx.fill();
    mainCtx.stroke();

    mainCtx.fillStyle = currentColor === '#0f172a' ? '#ffffff' : currentColor;
    mainCtx.textBaseline = 'middle';
    mainCtx.fillText(text, canvasX, canvasY - (textHeight / 2) + 2);
    mainCtx.restore();

    saveState();
  }

  function drawBlurPreview(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function applyPixelateBlur(ctx, x, y, w, h, pixelSize = 14) {
    const rx = Math.max(0, Math.min(x, x + w));
    const ry = Math.max(0, Math.min(y, y + h));
    const rw = Math.min(ctx.canvas.width - rx, Math.abs(w));
    const rh = Math.min(ctx.canvas.height - ry, Math.abs(h));

    if (rw <= 2 || rh <= 2) return;

    const sampleW = Math.max(1, Math.floor(rw / pixelSize));
    const sampleH = Math.max(1, Math.floor(rh / pixelSize));

    const temp = document.createElement('canvas');
    temp.width = sampleW;
    temp.height = sampleH;
    const tctx = temp.getContext('2d');

    // Downsample
    tctx.drawImage(ctx.canvas, rx, ry, rw, rh, 0, 0, sampleW, sampleH);

    // Upsample without smoothing
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp, 0, 0, sampleW, sampleH, rx, ry, rw, rh);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 6. Interactive Crop Tool Engine
  function initCropBox() {
    cropRect = {
      x: 40,
      y: 40,
      w: mainCanvas.width - 80,
      h: mainCanvas.height - 80
    };
    updateCropBoxToCanvas();
  }

  function updateCropBoxToCanvas() {
    cropBox.style.left = `${cropRect.x}px`;
    cropBox.style.top = `${cropRect.y}px`;
    cropBox.style.width = `${cropRect.w}px`;
    cropBox.style.height = `${cropRect.h}px`;
    cropDims.textContent = `${Math.round(cropRect.w)} × ${Math.round(cropRect.h)} px`;
  }

  cropBox.querySelectorAll('.crop-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizingCrop = true;
      activeCropHandle = handle.className.replace('crop-handle ', '').trim();
      cropDragStart = {
        x: e.clientX,
        y: e.clientY,
        rect: { ...cropRect }
      };
    });
  });

  cropBox.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('crop-handle')) return;
    isMovingCrop = true;
    cropDragStart = {
      x: e.clientX,
      y: e.clientY,
      rect: { ...cropRect }
    };
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizingCrop && !isMovingCrop) return;

    const dx = (e.clientX - cropDragStart.x) / currentZoom;
    const dy = (e.clientY - cropDragStart.y) / currentZoom;

    if (isMovingCrop) {
      cropRect.x = Math.max(0, Math.min(mainCanvas.width - cropDragStart.rect.w, cropDragStart.rect.x + dx));
      cropRect.y = Math.max(0, Math.min(mainCanvas.height - cropDragStart.rect.h, cropDragStart.rect.y + dy));
      updateCropBoxToCanvas();
    } else if (isResizingCrop) {
      const orig = cropDragStart.rect;
      let newX = orig.x;
      let newY = orig.y;
      let newW = orig.w;
      let newH = orig.h;

      if (activeCropHandle.includes('e')) newW = Math.max(20, orig.w + dx);
      if (activeCropHandle.includes('s')) newH = Math.max(20, orig.h + dy);
      if (activeCropHandle.includes('w')) {
        newW = Math.max(20, orig.w - dx);
        newX = orig.x + (orig.w - newW);
      }
      if (activeCropHandle.includes('n')) {
        newH = Math.max(20, orig.h - dy);
        newY = orig.y + (orig.h - newH);
      }

      cropRect = { x: newX, y: newY, w: newW, h: newH };
      updateCropBoxToCanvas();
    }
  });

  window.addEventListener('mouseup', () => {
    isResizingCrop = false;
    isMovingCrop = false;
  });

  btnApplyCrop.addEventListener('click', () => {
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = Math.round(cropRect.w);
    croppedCanvas.height = Math.round(cropRect.h);
    const cctx = croppedCanvas.getContext('2d');

    cctx.drawImage(mainCanvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);

    initCanvasDimensions(croppedCanvas.width, croppedCanvas.height);
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    mainCtx.drawImage(croppedCanvas, 0, 0);
    annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

    saveState();
    selectTool('pan');
    showToast('Crop applied');
    autoFitZoom();
  });

  btnCancelCrop.addEventListener('click', () => {
    selectTool('pan');
  });

  // 7. Export & Copy Actions
  btnExportDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });

  window.addEventListener('click', () => {
    exportMenu.classList.remove('open');
  });

  function getCombinedCanvas() {
    const combined = document.createElement('canvas');
    combined.width = mainCanvas.width;
    combined.height = mainCanvas.height;
    const cctx = combined.getContext('2d');
    cctx.fillStyle = '#FFFFFF';
    cctx.fillRect(0, 0, combined.width, combined.height);
    cctx.drawImage(mainCanvas, 0, 0);
    cctx.drawImage(annotationCanvas, 0, 0);
    return combined;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getExportFilename(extension) {
    const rawTitle = currentScreenshot?.title || 'Screenshot';
    const clean = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    const ts = new Date().toISOString().slice(0, 10);
    return `SnapFull_${clean}_${ts}.${extension}`;
  }

  // Copy to Clipboard
  btnCopyClipboard.addEventListener('click', async () => {
    try {
      const combined = getCombinedCanvas();
      combined.toBlob(async (blob) => {
        if (!blob) throw new Error('Failed to create image blob');
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showToast('Screenshot copied to clipboard!');
      }, 'image/png');
    } catch (err) {
      console.error(err);
      showToast('Clipboard write error. Please use Download instead.');
    }
  });

  // Download PNG
  exportPng.addEventListener('click', () => {
    const combined = getCombinedCanvas();
    combined.toBlob((blob) => {
      downloadBlob(blob, getExportFilename('png'));
      showToast('PNG downloaded!');
    }, 'image/png');
  });

  // Download JPG
  exportJpg.addEventListener('click', () => {
    const combined = getCombinedCanvas();
    combined.toBlob((blob) => {
      downloadBlob(blob, getExportFilename('jpg'));
      showToast('JPEG downloaded!');
    }, 'image/jpeg', 0.92);
  });

  // Export PDF (Single Continuous Page)
  exportPdfSingle.addEventListener('click', async () => {
    try {
      showToast('Generating PDF...');
      const combined = getCombinedCanvas();
      const pdfBlob = await MiniPDFExport.canvasToContinuousPDF(combined, {
        title: currentScreenshot?.title || 'Screenshot'
      });
      downloadBlob(pdfBlob, getExportFilename('pdf'));
      showToast('Continuous PDF downloaded!');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate PDF: ' + err.message);
    }
  });

  // Export PDF (A4 Paginated)
  exportPdfA4.addEventListener('click', async () => {
    try {
      showToast('Generating paginated A4 PDF...');
      const combined = getCombinedCanvas();
      const pdfBlob = await MiniPDFExport.canvasToA4PDF(combined, {
        title: currentScreenshot?.title || 'Screenshot'
      });
      downloadBlob(pdfBlob, getExportFilename('pdf'));
      showToast('A4 Paginated PDF downloaded!');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate A4 PDF: ' + err.message);
    }
  });

  // Print Screenshot
  btnPrint.addEventListener('click', () => {
    const combined = getCombinedCanvas();
    const dataUrl = combined.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${docTitle.textContent}</title>
          <style>
            body { margin: 0; padding: 10px; display: flex; justify-content: center; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body onload="window.print();window.close();">
          <img src="${dataUrl}">
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  });

  // Toast Notification Helper
  let toastTimer = null;
  function showToast(message, duration = 2400) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }
});
