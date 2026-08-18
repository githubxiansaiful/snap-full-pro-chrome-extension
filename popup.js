/**
 * SnapFull - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const btnCaptureFull = document.getElementById('btn-capture-full');
  const btnCaptureVisible = document.getElementById('btn-capture-visible');
  const btnCaptureRegion = document.getElementById('btn-capture-region');
  const btnCaptureElement = document.getElementById('btn-capture-element');
  const selectPostAction = document.getElementById('select-post-action');
  const timerGroup = document.getElementById('timer-group');
  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');

  // Tab Buttons & Panels
  const tabCapture = document.getElementById('btn-tab-capture');
  const tabHistory = document.getElementById('btn-tab-history');
  const tabSettings = document.getElementById('btn-tab-settings');

  const viewCapture = document.getElementById('view-capture');
  const viewHistory = document.getElementById('view-history');
  const viewSettings = document.getElementById('view-settings');

  // History Elements
  const historyList = document.getElementById('history-list');
  const btnClearHistory = document.getElementById('btn-clear-history');

  // Settings Elements
  const settingHideFixed = document.getElementById('setting-hide-fixed');
  const settingScrollDelay = document.getElementById('setting-scroll-delay');
  const settingDefaultFormat = document.getElementById('setting-default-format');

  let selectedDelay = 0;
  let activeTab = null;

  // Initialize active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
    if (activeTab && isRestrictedUrl(activeTab.url)) {
      showError('Note: Internal browser pages (chrome://, Web Store) cannot be captured. Switch to any normal webpage.');
    }
  } catch (e) {
    console.error(e);
  }

  // Load saved settings
  const stored = await chrome.storage.local.get(['snapfull_settings']);
  const settings = stored.snapfull_settings || {
    postAction: 'editor',
    scrollDelay: 350,
    hideFixedElements: true,
    defaultFormat: 'png'
  };

  selectPostAction.value = settings.postAction || 'editor';
  settingHideFixed.checked = settings.hideFixedElements ?? true;
  settingScrollDelay.value = String(settings.scrollDelay || 350);
  settingDefaultFormat.value = settings.defaultFormat || 'png';

  // Save settings on change
  async function persistSettings() {
    const updated = {
      postAction: selectPostAction.value,
      scrollDelay: parseInt(settingScrollDelay.value, 10),
      hideFixedElements: settingHideFixed.checked,
      defaultFormat: settingDefaultFormat.value
    };
    await chrome.storage.local.set({ snapfull_settings: updated });
  }

  selectPostAction.addEventListener('change', persistSettings);
  settingHideFixed.addEventListener('change', persistSettings);
  settingScrollDelay.addEventListener('change', persistSettings);
  settingDefaultFormat.addEventListener('change', persistSettings);

  // Tab switching
  function switchTab(target) {
    [tabCapture, tabHistory, tabSettings].forEach(t => t.classList.remove('active'));
    [viewCapture, viewHistory, viewSettings].forEach(v => v.classList.remove('active'));

    if (target === 'history') {
      tabHistory.classList.add('active');
      viewHistory.classList.add('active');
      loadHistory();
    } else if (target === 'settings') {
      tabSettings.classList.add('active');
      viewSettings.classList.add('active');
    } else {
      tabCapture.classList.add('active');
      viewCapture.classList.add('active');
    }
  }

  tabCapture.addEventListener('click', () => switchTab('capture'));
  tabHistory.addEventListener('click', () => switchTab('history'));
  tabSettings.addEventListener('click', () => switchTab('settings'));

  // Timer Pills
  timerGroup.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    timerGroup.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedDelay = parseInt(pill.dataset.delay || '0', 10);
  });

  // Capture Trigger
  async function triggerCapture(type) {
    if (!activeTab || !activeTab.id) {
      showError('No active browser tab found.');
      return;
    }

    if (isRestrictedUrl(activeTab.url)) {
      showError('Cannot capture browser internal pages. Please open a regular website.');
      return;
    }

    hideError();

    const options = {
      type,
      delay: selectedDelay,
      postAction: selectPostAction.value,
      scrollDelay: parseInt(settingScrollDelay.value, 10),
      hideFixedElements: settingHideFixed.checked,
      format: settingDefaultFormat.value
    };

    // Send capture trigger to background service worker
    chrome.runtime.sendMessage({
      action: 'START_CAPTURE',
      tab: activeTab,
      options
    }).catch(err => {
      console.warn('Capture dispatch:', err);
    });

    // Close popup immediately so full webpage HUD and elements are visible and not obstructed
    setTimeout(() => {
      window.close();
    }, 60);
  }

  btnCaptureFull.addEventListener('click', () => triggerCapture('full'));
  btnCaptureVisible.addEventListener('click', () => triggerCapture('visible'));
  btnCaptureRegion.addEventListener('click', () => triggerCapture('region'));
  btnCaptureElement.addEventListener('click', () => triggerCapture('element'));

  // Load History List
  async function loadHistory() {
    let history = [];
    try {
      if (typeof SnapDB !== 'undefined') {
        history = await SnapDB.getHistory(20);
      } else {
        const resp = await chrome.runtime.sendMessage({ action: 'GET_HISTORY' });
        history = resp?.data || [];
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    }

    if (!history || history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <p>No screenshots taken yet</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = '';

    history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      
      const timeStr = formatRelativeTime(item.timestamp);
      const dims = `${item.width} × ${item.height} px`;

      el.innerHTML = `
        <img class="history-thumb" src="${item.thumbnail || ''}" alt="Thumbnail">
        <div class="history-details">
          <div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="history-meta">${(item.type || 'full').toUpperCase()} &bull; ${dims} &bull; ${timeStr}</div>
        </div>
        <div class="history-actions">
          <button class="history-action-btn btn-open" title="Open in Studio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
          <button class="history-action-btn btn-del" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      el.querySelector('.btn-open').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${item.id}`) });
      });

      el.querySelector('.btn-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({ action: 'DELETE_SCREENSHOT', id: item.id });
        loadHistory();
      });

      el.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${item.id}`) });
      });

      historyList.appendChild(el);
    });
  }

  btnClearHistory.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY' });
    loadHistory();
  });

  // Helpers
  function setCapturingState(type, loading) {
    const btnMap = {
      full: btnCaptureFull,
      visible: btnCaptureVisible,
      region: btnCaptureRegion,
      element: btnCaptureElement
    };
    const targetBtn = btnMap[type];
    if (!targetBtn) return;

    if (loading) {
      targetBtn.style.opacity = '0.6';
      targetBtn.style.pointerEvents = 'none';
    } else {
      targetBtn.style.opacity = '1';
      targetBtn.style.pointerEvents = 'auto';
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.classList.remove('hidden');
  }

  function hideError() {
    errorBanner.classList.add('hidden');
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    const prefixes = [
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
    return prefixes.some(p => url.startsWith(p));
  }

  function formatRelativeTime(ts) {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
});
