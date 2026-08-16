importScripts('storage-db.js');

let activeCaptures = new Map();
const screenshotMemoryCache = new Map();

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  const settings = await getSettings();

  switch (command) {
    case 'capture-full-page':
      startCapture(tab, { type: 'full', ...settings });
      break;
    case 'capture-visible':
      startCapture(tab, { type: 'visible', ...settings });
      break;
    case 'capture-selected':
      startCapture(tab, { type: 'region', ...settings });
      break;
    default:
      break;
  }
});

// Message listener from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_CAPTURE') {
    (async () => {
      try {
        let tab = message.tab;
        if (!tab || !tab.id) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tab = tabs[0];
        }
        if (!tab || !tab.id) throw new Error('No active browser tab found');

        const result = await startCapture(tab, message.options || {});
        sendResponse({ success: true, captureId: result.id });
      } catch (err) {
        console.error('Capture failed:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === 'CANCEL_CAPTURE') {
    if (sender.tab && sender.tab.id) {
      activeCaptures.delete(sender.tab.id);
    }
    sendResponse({ success: true });
  }

  if (message.action === 'GET_SCREENSHOT') {
    (async () => {
      try {
        const data = await getScreenshotData(message.id);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'DELETE_SCREENSHOT') {
    (async () => {
      try {
        await deleteScreenshotData(message.id);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'GET_HISTORY') {
    (async () => {
      try {
        const list = await SnapDB.getHistory(message.limit || 20);
        sendResponse({ success: true, data: list });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'CLEAR_HISTORY') {
    (async () => {
      try {
        screenshotMemoryCache.clear();
        await SnapDB.clearAll();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

/**
 * Main Capture Orchestrator
 */
async function startCapture(tab, options = {}) {
  // Validate URL compatibility
  if (isRestrictedUrl(tab.url)) {
    throw new Error('Chrome extensions cannot capture internal browser pages (chrome://, webstore, etc.). Please switch to a regular website.');
  }

  // Ensure content script & styles are injected
  await ensureContentScript(tab.id);

  const captureId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  activeCaptures.set(tab.id, { cancelled: false, id: captureId });

  try {
    // Check for countdown timer
    if (options.delay && options.delay > 0) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_COUNTDOWN',
        seconds: options.delay
      });
    }

    let finalDataUrl = '';
    let captureWidth = 0;
    let captureHeight = 0;
    let pageTitle = tab.title || 'Screenshot';
    let pageUrl = tab.url || '';

    switch (options.type) {
      case 'full': {
        const fullResult = await captureFullPageFlow(tab, options, captureId);
        finalDataUrl = fullResult.dataUrl;
        captureWidth = fullResult.width;
        captureHeight = fullResult.height;
        pageTitle = fullResult.pageTitle || pageTitle;
        pageUrl = fullResult.pageUrl || pageUrl;
        break;
      }

      case 'visible': {
        await chrome.tabs.sendMessage(tab.id, { action: 'FLASH_SCREEN' }).catch(() => {});
        const sliceDataUrl = await captureVisibleTabPromise(tab.windowId);
        const imgBitmap = await dataUrlToBitmap(sliceDataUrl);
        captureWidth = imgBitmap.width;
        captureHeight = imgBitmap.height;
        finalDataUrl = sliceDataUrl;
        break;
      }

      case 'region': {
        const regionRes = await chrome.tabs.sendMessage(tab.id, { action: 'START_REGION_CAPTURE' });
        if (!regionRes || !regionRes.success || !regionRes.rect) {
          throw new Error(regionRes?.error || 'Region capture was cancelled');
        }
        await wait(60);
        await chrome.tabs.sendMessage(tab.id, { action: 'FLASH_SCREEN' }).catch(() => {});
        const visibleDataUrl = await captureVisibleTabPromise(tab.windowId);
        const cropped = await cropDataUrl(visibleDataUrl, regionRes.rect);
        finalDataUrl = cropped.dataUrl;
        captureWidth = cropped.width;
        captureHeight = cropped.height;
        pageTitle = regionRes.rect.pageTitle || pageTitle;
        pageUrl = regionRes.rect.pageUrl || pageUrl;
        break;
      }

      case 'element': {
        const elemRes = await chrome.tabs.sendMessage(tab.id, { action: 'START_ELEMENT_CAPTURE' });
        if (!elemRes || !elemRes.success || !elemRes.rect) {
          throw new Error(elemRes?.error || 'Element picker was cancelled');
        }
        await wait(60);
        await chrome.tabs.sendMessage(tab.id, { action: 'FLASH_SCREEN' }).catch(() => {});
        const visibleDataUrl = await captureVisibleTabPromise(tab.windowId);
        const cropped = await cropDataUrl(visibleDataUrl, elemRes.rect);
        finalDataUrl = cropped.dataUrl;
        captureWidth = cropped.width;
        captureHeight = cropped.height;
        pageTitle = elemRes.rect.pageTitle || pageTitle;
        pageUrl = elemRes.rect.pageUrl || pageUrl;
        break;
      }

      default:
        throw new Error(`Unknown capture type: ${options.type}`);
    }

    if (!finalDataUrl) {
      throw new Error('Capture failed to generate image data');
    }

    // Create thumbnail for fast gallery loading
    const thumbUrl = await createThumbnail(finalDataUrl, 160);

    // Save screenshot data
    const screenshotObject = {
      id: captureId,
      timestamp: Date.now(),
      dataUrl: finalDataUrl,
      thumbnail: thumbUrl,
      width: captureWidth,
      height: captureHeight,
      title: pageTitle,
      url: pageUrl,
      type: options.type || 'full'
    };

    await saveScreenshotData(screenshotObject);

    // Handle post-capture action
    const postAction = options.postAction || 'editor';

    if (postAction === 'download') {
      const filename = sanitizeFilename(pageTitle) + `_${formatTimestamp(Date.now())}.png`;
      await chrome.downloads.download({
        url: finalDataUrl,
        filename: filename,
        saveAs: false
      });
    } else {
      // Default: Open Viewer & Editor tab
      const viewerUrl = chrome.runtime.getURL(`viewer.html?id=${captureId}`);
      await chrome.tabs.create({ url: viewerUrl, active: true });
    }

    return { id: captureId };
  } finally {
    activeCaptures.delete(tab.id);
  }
}

/**
 * Full Page Capture choreography and stitching
 */
async function captureFullPageFlow(tab, options, captureId) {
  // Step 1: Tell content script to prepare and measure page
  const prepRes = await chrome.tabs.sendMessage(tab.id, {
    action: 'PREPARE_FULL_PAGE',
    options: {
      hideFixedElements: options.hideFixedElements ?? true,
      scrollDelay: options.scrollDelay ?? 250
    }
  });

  if (!prepRes || !prepRes.success || !prepRes.data) {
    throw new Error(prepRes?.error || 'Failed to initialize full-page capture');
  }

  const {
    totalWidth,
    totalHeight,
    viewportWidth,
    viewportHeight,
    dpr,
    pageTitle,
    pageUrl
  } = prepRes.data;

  // Calculate slice positions
  const slices = [];
  let currentY = 0;
  const stepCount = Math.ceil(totalHeight / viewportHeight);

  for (let i = 0; i < stepCount; i++) {
    // If last step, ensure we align precisely to the bottom of the page
    if (i === stepCount - 1 && currentY + viewportHeight > totalHeight) {
      currentY = Math.max(0, totalHeight - viewportHeight);
    }

    slices.push({
      stepIndex: i,
      totalSteps: stepCount,
      scrollY: currentY,
      isLast: i === stepCount - 1
    });

    currentY += viewportHeight;
  }

  const capturedSlices = [];

  try {
    for (let i = 0; i < slices.length; i++) {
      const state = activeCaptures.get(tab.id);
      if (!state || state.cancelled) {
        throw new Error('Capture cancelled by user');
      }

      const slice = slices[i];

      // Command content script to scroll
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SCROLL_PAGE_TO',
        x: 0,
        y: slice.scrollY,
        stepIndex: slice.stepIndex,
        totalSteps: slice.totalSteps,
        options: {
          hideFixedElements: options.hideFixedElements ?? true,
          scrollDelay: options.scrollDelay ?? 250
        }
      });

      // Capture visible slice
      const sliceDataUrl = await captureVisibleTabPromise(tab.windowId);
      const bitmap = await dataUrlToBitmap(sliceDataUrl);

      capturedSlices.push({
        bitmap,
        scrollY: slice.scrollY,
        isLast: slice.isLast
      });
    }
  } finally {
    // Always cleanup page modifications
    await chrome.tabs.sendMessage(tab.id, { action: 'CLEANUP_FULL_PAGE' }).catch(() => {});
  }

  // Safety limits on maximum canvas size to prevent hardware allocation crash
  const MAX_CANVAS_DIM = 24000;
  let effectiveDpr = dpr;
  if (totalHeight * effectiveDpr > MAX_CANVAS_DIM) {
    effectiveDpr = MAX_CANVAS_DIM / totalHeight;
  }

  // Stitch slices onto OffscreenCanvas
  const fullCanvasWidth = Math.round(viewportWidth * effectiveDpr);
  const fullCanvasHeight = Math.round(totalHeight * effectiveDpr);

  const offscreen = new OffscreenCanvas(fullCanvasWidth, fullCanvasHeight);
  const ctx = offscreen.getContext('2d');

  // Fill with white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, fullCanvasWidth, fullCanvasHeight);

  for (let i = 0; i < capturedSlices.length; i++) {
    const slice = capturedSlices[i];
    const drawY = Math.round(slice.scrollY * effectiveDpr);
    const drawW = Math.round(slice.bitmap.width * (effectiveDpr / dpr));
    const drawH = Math.round(slice.bitmap.height * (effectiveDpr / dpr));
    ctx.drawImage(slice.bitmap, 0, drawY, drawW, drawH);
  }

  const blob = await offscreen.convertToBlob({ type: 'image/png' });
  const finalDataUrl = await blobToDataUrl(blob);

  return {
    dataUrl: finalDataUrl,
    width: fullCanvasWidth,
    height: fullCanvasHeight,
    pageTitle,
    pageUrl
  };
}

/**
 * Crop visible tab capture to rectangle
 */
async function cropDataUrl(dataUrl, rect) {
  const bitmap = await dataUrlToBitmap(dataUrl);
  const dpr = rect.dpr || 1;

  const cropX = Math.round(rect.x * dpr);
  const cropY = Math.round(rect.y * dpr);
  const cropW = Math.round(rect.width * dpr);
  const cropH = Math.round(rect.height * dpr);

  const offscreen = new OffscreenCanvas(cropW, cropH);
  const ctx = offscreen.getContext('2d');

  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const blob = await offscreen.convertToBlob({ type: 'image/png' });
  const croppedDataUrl = await blobToDataUrl(blob);

  return {
    dataUrl: croppedDataUrl,
    width: cropW,
    height: cropH
  };
}

/**
 * Convert Data URL to ImageBitmap for OffscreenCanvas
 */
async function dataUrlToBitmap(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

/**
 * Convert Blob to Data URL
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Capture Visible Tab Promisified
 */
function captureVisibleTabPromise(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!dataUrl) {
        reject(new Error('Failed to capture tab screenshot'));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

/**
 * Ensure content script and CSS are injected into tab
 */
async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (ping && ping.status === 'ok') return;
  } catch (e) {
    // Not injected yet, inject programmatically
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content.css']
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

/**
 * Check if URL is restricted
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'chrome-search://',
    'devtools://',
    'edge://',
    'about:',
    'view-source:',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com'
  ];
  return restrictedPrefixes.some(prefix => url.startsWith(prefix));
}

/**
 * Settings and Storage Management
 */
async function getSettings() {
  const result = await chrome.storage.local.get(['snapfull_settings']);
  return result.snapfull_settings || {
    postAction: 'editor',
    scrollDelay: 250,
    hideFixedElements: true,
    delay: 0
  };
}

async function saveScreenshotData(item) {
  // Store in active in-memory cache for immediate fast access
  screenshotMemoryCache.set(item.id, item);

  // Store in IndexedDB (Unlimited quota)
  await SnapDB.saveScreenshot(item);
}

async function getScreenshotData(id) {
  if (screenshotMemoryCache.has(id)) {
    return screenshotMemoryCache.get(id);
  }
  return await SnapDB.getScreenshot(id);
}

async function deleteScreenshotData(id) {
  screenshotMemoryCache.delete(id);
  await SnapDB.deleteScreenshot(id);
}

async function createThumbnail(dataUrl, maxSide) {
  try {
    const bitmap = await dataUrlToBitmap(dataUrl);
    let tw = bitmap.width;
    let th = bitmap.height;

    if (tw > th) {
      th = Math.round((th * maxSide) / tw);
      tw = maxSide;
    } else {
      tw = Math.round((tw * maxSide) / th);
      th = maxSide;
    }

    const offscreen = new OffscreenCanvas(Math.max(1, tw), Math.max(1, th));
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, tw, th);

    const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return await blobToDataUrl(blob);
  } catch (e) {
    return '';
  }
}

function sanitizeFilename(name) {
  return (name || 'screenshot').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
