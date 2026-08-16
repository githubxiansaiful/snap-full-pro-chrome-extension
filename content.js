/**
 * SnapFull - Content Script
 * Handles page dimensions measurement, scrolling choreography, HUD,
 * region selection overlay, and DOM element picker.
 */

(function () {
  // Prevent duplicate injection
  if (window.__snapFullInjected) return;
  window.__snapFullInjected = true;

  let originalScrollX = 0;
  let originalScrollY = 0;
  let originalOverflow = '';
  let originalBodyOverflow = '';
  let fixedElements = [];
  let isCapturing = false;
  let captureCancelled = false;

  // Active overlay references
  let overlayRoot = null;
  let progressHud = null;

  // Message dispatcher
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'PING':
        sendResponse({ status: 'ok' });
        break;

      case 'PREPARE_FULL_PAGE':
        prepareFullPage(message.options)
          .then(data => sendResponse({ success: true, data }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async

      case 'SCROLL_PAGE_TO':
        scrollPageTo(message.x, message.y, message.stepIndex, message.totalSteps, message.options)
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;

      case 'CLEANUP_FULL_PAGE':
        cleanupFullPage(message.cancelled);
        sendResponse({ success: true });
        break;

      case 'START_REGION_CAPTURE':
        startRegionCapture()
          .then(rect => sendResponse({ success: true, rect }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;

      case 'START_ELEMENT_CAPTURE':
        startElementCapture()
          .then(rect => sendResponse({ success: true, rect }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;

      case 'SHOW_COUNTDOWN':
        showCountdown(message.seconds || 3)
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;

      case 'FLASH_SCREEN':
        showFlashEffect();
        sendResponse({ success: true });
        break;

      default:
        break;
    }
  });

  /**
   * Get accurate page dimensions and prepare DOM for full-page capture
   */
  async function prepareFullPage(options = {}) {
    isCapturing = true;
    captureCancelled = false;

    originalScrollX = window.scrollX || window.pageXOffset || 0;
    originalScrollY = window.scrollY || window.pageYOffset || 0;
    originalOverflow = document.documentElement.style.overflow;
    originalBodyOverflow = document.body.style.overflow;

    // Detect page dimensions
    const body = document.body;
    const html = document.documentElement;

    const totalWidth = Math.max(
      body.scrollWidth || 0,
      body.offsetWidth || 0,
      html.clientWidth || 0,
      html.scrollWidth || 0,
      html.offsetWidth || 0,
      window.innerWidth
    );

    const totalHeight = Math.max(
      body.scrollHeight || 0,
      body.offsetHeight || 0,
      html.clientHeight || 0,
      html.scrollHeight || 0,
      html.offsetHeight || 0,
      window.innerHeight
    );

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // Find fixed / sticky elements if requested to prevent duplication
    fixedElements = [];
    if (options.hideFixedElements) {
      findFixedElements();
    }

    // Hide scrollbars smoothly
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Show Progress HUD
    showProgressHud();

    // Scroll to top first
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    await wait(options.scrollDelay || 200);

    // Hide HUD before initial capture slice
    if (progressHud) {
      progressHud.style.display = 'none';
    }
    await nextFrame();

    return {
      totalWidth,
      totalHeight,
      viewportWidth,
      viewportHeight,
      dpr,
      originalScrollX,
      originalScrollY,
      pageTitle: document.title || 'Webpage Screenshot',
      pageUrl: window.location.href
    };
  }

  /**
   * Find fixed and sticky position elements on the page
   */
  function findFixedElements() {
    try {
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el === progressHud || el.closest('#snapfull-overlay-root')) continue;
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          fixedElements.push({
            element: el,
            originalVisibility: el.style.visibility
          });
        }
      }
    } catch (e) {
      console.warn('Could not query fixed elements:', e);
    }
  }

  /**
   * Scroll page to a specific Y coordinate and update HUD
   */
  async function scrollPageTo(x, y, stepIndex, totalSteps, options = {}) {
    if (captureCancelled) {
      throw new Error('Capture cancelled by user');
    }

    // Show Progress HUD while scrolling and settling
    if (progressHud) {
      progressHud.style.display = 'flex';
      progressHud.style.visibility = 'visible';
    }

    // If hideFixedElements is active, hide them after the 1st top slice
    if (options.hideFixedElements && fixedElements.length > 0) {
      if (stepIndex > 0) {
        fixedElements.forEach(item => {
          item.element.style.visibility = 'hidden';
        });
      } else {
        fixedElements.forEach(item => {
          item.element.style.visibility = item.originalVisibility;
        });
      }
    }

    window.scrollTo({ left: x, top: y, behavior: 'instant' });

    // Update Progress HUD
    updateProgressHud(stepIndex + 1, totalSteps);

    // Wait for repaint and lazy assets
    const delay = options.scrollDelay || 250;
    await wait(delay);
    await nextFrame();

    // HIDE Progress HUD immediately before taking screenshot slice!
    if (progressHud) {
      progressHud.style.display = 'none';
    }
    await nextFrame();
  }

  /**
   * Cleanup DOM modifications after full page capture
   */
  function cleanupFullPage(cancelled = false) {
    isCapturing = false;

    // Restore fixed elements visibility
    if (fixedElements && fixedElements.length > 0) {
      fixedElements.forEach(item => {
        try {
          item.element.style.visibility = item.originalVisibility;
        } catch (e) {}
      });
      fixedElements = [];
    }

    // Restore overflow
    document.documentElement.style.overflow = originalOverflow;
    document.body.style.overflow = originalBodyOverflow;

    // Restore original scroll position
    window.scrollTo({ left: originalScrollX, top: originalScrollY, behavior: 'instant' });

    // Remove Progress HUD
    removeProgressHud();
  }

  /**
   * Display floating Progress HUD
   */
  function showProgressHud() {
    removeProgressHud();

    progressHud = document.createElement('div');
    progressHud.className = 'snapfull-progress-hud';
    progressHud.innerHTML = `
      <div class="snapfull-progress-header">
        <div class="snapfull-progress-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          Capturing Full Page
        </div>
        <button class="snapfull-progress-cancel" id="snapfull-cancel-btn">Cancel</button>
      </div>
      <div class="snapfull-progress-bar-bg">
        <div class="snapfull-progress-bar-fill" id="snapfull-progress-fill"></div>
      </div>
      <div class="snapfull-progress-status">
        <span id="snapfull-progress-text">Scrolling sections...</span>
        <span id="snapfull-progress-pct">0%</span>
      </div>
    `;

    document.documentElement.appendChild(progressHud);

    const cancelBtn = progressHud.querySelector('#snapfull-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        captureCancelled = true;
        chrome.runtime.sendMessage({ action: 'CANCEL_CAPTURE' });
        cleanupFullPage(true);
      });
    }
  }

  /**
   * Update Progress HUD percentage
   */
  function updateProgressHud(current, total) {
    if (!progressHud) return;
    const pct = Math.round((current / total) * 100);
    const fill = progressHud.querySelector('#snapfull-progress-fill');
    const text = progressHud.querySelector('#snapfull-progress-text');
    const pctEl = progressHud.querySelector('#snapfull-progress-pct');

    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `Section ${current} of ${total}`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  /**
   * Remove Progress HUD
   */
  function removeProgressHud() {
    if (progressHud && progressHud.parentNode) {
      progressHud.parentNode.removeChild(progressHud);
    }
    progressHud = null;
  }

  /**
   * Region Selection Capture Tool
   */
  function startRegionCapture() {
    return new Promise((resolve, reject) => {
      removeActiveOverlay();

      const root = document.createElement('div');
      root.id = 'snapfull-overlay-root';

      const backdrop = document.createElement('div');
      backdrop.className = 'snapfull-region-backdrop';

      const toast = document.createElement('div');
      toast.className = 'snapfull-instruction-toast';
      toast.innerHTML = `<span>Drag to select capture region &nbsp;|&nbsp; Press <kbd>ESC</kbd> to cancel</span>`;

      const selectionBox = document.createElement('div');
      selectionBox.className = 'snapfull-selection-box';
      selectionBox.style.display = 'none';

      const dimensionsPill = document.createElement('div');
      dimensionsPill.className = 'snapfull-dimensions-pill';
      selectionBox.appendChild(dimensionsPill);

      root.appendChild(backdrop);
      root.appendChild(toast);
      root.appendChild(selectionBox);
      document.documentElement.appendChild(root);
      overlayRoot = root;

      let isSelecting = false;
      let startX = 0;
      let startY = 0;
      let endX = 0;
      let endY = 0;

      function onMouseDown(e) {
        if (e.button !== 0) return; // Left click only
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;
        selectionBox.style.left = `${startX}px`;
        selectionBox.style.top = `${startY}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';
      }

      function onMouseMove(e) {
        if (!isSelecting) return;
        endX = e.clientX;
        endY = e.clientY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        selectionBox.style.left = `${left}px`;
        selectionBox.style.top = `${top}px`;
        selectionBox.style.width = `${width}px`;
        selectionBox.style.height = `${height}px`;

        dimensionsPill.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
      }

      function onMouseUp(e) {
        if (!isSelecting) return;
        isSelecting = false;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        cleanup();

        if (width < 8 || height < 8) {
          reject(new Error('Selection area too small'));
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        resolve({
          x: left,
          y: top,
          width,
          height,
          dpr,
          pageTitle: document.title || 'Selected Region Screenshot',
          pageUrl: window.location.href
        });
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          cleanup();
          reject(new Error('Selection cancelled'));
        }
      }

      function cleanup() {
        window.removeEventListener('mousedown', onMouseDown, true);
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        window.removeEventListener('keydown', onKeyDown, true);
        removeActiveOverlay();
      }

      window.addEventListener('mousedown', onMouseDown, true);
      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mouseup', onMouseUp, true);
      window.addEventListener('keydown', onKeyDown, true);
    });
  }

  /**
   * DOM Element Picker Capture Tool
   */
  function startElementCapture() {
    return new Promise((resolve, reject) => {
      removeActiveOverlay();

      const root = document.createElement('div');
      root.id = 'snapfull-overlay-root';

      const toast = document.createElement('div');
      toast.className = 'snapfull-instruction-toast';
      toast.innerHTML = `<span>Click any element to capture &nbsp;|&nbsp; Press <kbd>ESC</kbd> to cancel</span>`;

      const highlight = document.createElement('div');
      highlight.className = 'snapfull-element-highlight';
      highlight.style.display = 'none';

      const tagBadge = document.createElement('div');
      tagBadge.className = 'snapfull-element-tag';
      highlight.appendChild(tagBadge);

      root.appendChild(toast);
      root.appendChild(highlight);
      document.documentElement.appendChild(root);
      overlayRoot = root;

      let hoveredElement = null;

      function onMouseMove(e) {
        // Temporarily hide highlight to get true target
        highlight.style.display = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        highlight.style.display = 'block';

        if (!target || target.closest('#snapfull-overlay-root')) return;
        hoveredElement = target;

        const rect = target.getBoundingClientRect();
        highlight.style.left = `${rect.left + window.scrollX}px`;
        highlight.style.top = `${rect.top + window.scrollY}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;

        const tagName = target.tagName.toLowerCase();
        const className = target.className && typeof target.className === 'string' ? '.' + target.className.trim().split(/\s+/)[0] : '';
        const idName = target.id ? '#' + target.id : '';
        tagBadge.textContent = `<${tagName}${idName}${className}> ${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
      }

      function onClick(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!hoveredElement) {
          cleanup();
          reject(new Error('No element selected'));
          return;
        }

        const target = hoveredElement;
        cleanup();

        // Get viewport relative bounding box
        const rect = target.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        if (rect.width <= 0 || rect.height <= 0) {
          reject(new Error('Element has 0 dimensions'));
          return;
        }

        resolve({
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: rect.width,
          height: rect.height,
          dpr,
          pageTitle: `${document.title || 'Webpage'} - Element <${target.tagName.toLowerCase()}>`,
          pageUrl: window.location.href
        });
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          cleanup();
          reject(new Error('Element picker cancelled'));
        }
      }

      function cleanup() {
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('click', onClick, true);
        window.removeEventListener('keydown', onKeyDown, true);
        removeActiveOverlay();
      }

      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('click', onClick, true);
      window.addEventListener('keydown', onKeyDown, true);
    });
  }

  /**
   * Countdown timer visual overlay
   */
  function showCountdown(seconds) {
    return new Promise(resolve => {
      removeActiveOverlay();

      const root = document.createElement('div');
      root.id = 'snapfull-overlay-root';

      const overlay = document.createElement('div');
      overlay.className = 'snapfull-countdown-overlay';

      const num = document.createElement('div');
      num.className = 'snapfull-countdown-number';
      num.textContent = seconds;

      const label = document.createElement('div');
      label.className = 'snapfull-countdown-label';
      label.textContent = 'Get ready... Capturing screenshot in';

      overlay.appendChild(label);
      overlay.appendChild(num);
      root.appendChild(overlay);
      document.documentElement.appendChild(root);
      overlayRoot = root;

      let remaining = seconds;
      const interval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          num.textContent = remaining;
        } else {
          clearInterval(interval);
          removeActiveOverlay();
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Camera flash feedback animation
   */
  function showFlashEffect() {
    const flash = document.createElement('div');
    flash.className = 'snapfull-flash-screen';
    document.documentElement.appendChild(flash);
    setTimeout(() => {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 450);
  }

  function removeActiveOverlay() {
    if (overlayRoot && overlayRoot.parentNode) {
      overlayRoot.parentNode.removeChild(overlayRoot);
    }
    overlayRoot = null;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
})();
