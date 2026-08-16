# SnapFull Pro - Full Page Screen Capture for Chrome

**SnapFull Pro** is a high-performance, full-featured Google Chrome Extension (Manifest V3) designed to capture full-length web pages, visible viewports, custom drag-and-drop regions, and specific DOM elements. It includes a built-in **Annotation Studio** with zero external dependencies, 100% offline security, and export to PNG, JPEG, Single Continuous PDF, or Multi-Page A4 PDF.

---

## ✨ Features

### 📸 Capture Modes
- **Full Webpage Capture**: Automatically scrolls through the entire page, stitches the sections seamlessly using high-resolution canvas rendering, and hides repeating fixed/sticky headers during scrolling.
- **Visible Viewport Capture**: One-click instant screenshot of what's currently on your screen.
- **Selected Region Capture**: Interactive darkened screen with crosshairs and live pixel dimension HUD—drag to crop and capture.
- **DOM Element Picker**: Hover over any HTML element on the page (cards, hero banners, data tables) to inspect and click to capture.
- **Countdown Timer**: 3s, 5s, or 10s countdown timer before taking screenshots (ideal for capturing menus, dropdowns, and hover states).

### 🎨 Screenshot Annotation Studio (`viewer.html`)
- **Zoom & Pan**: Smooth wheel zoom (`Ctrl + Wheel`), auto-fit to window, 1:1 pixel mode, and pan navigation (hold `Spacebar`).
- **Live Crop Tool**: 8-point resizable crop bounding box with dimensions readout.
- **Annotation Tools**:
  - **Rectangle & Circle/Ellipse** (crisp geometric framing)
  - **Arrow Pointer & Straight Line** (vector arrowheads for bug reports and walkthroughs)
  - **Freehand Pen & Highlighter** (smooth curve drawing and translucent markers)
  - **Text Tool** (customizable font size, text color, and background badge)
  - **Numbered Step Badges** (1, 2, 3... auto-incrementing circular step indicators)
  - **Blur / Redact / Pixelate Tool** (redact passwords, emails, and sensitive info directly on canvas)
- **Multi-Level Undo & Redo**: Full state stack with `Ctrl+Z` / `Ctrl+Y` shortcuts.

### 💾 Export & Sharing
- **Copy Image to Clipboard**: Direct one-click copy to system clipboard for instant pasting into Slack, Notion, Discord, or Figma.
- **Download PNG**: Crystal-clear lossless quality.
- **Download JPEG**: Lightweight compressed image.
- **Export to Continuous PDF**: Single continuous PDF document matching exact webpage length.
- **Export to A4 Paginated PDF**: Automatically slices long webpage captures into standard printable A4 pages with margins.
- **Print Screenshot**: Direct browser print dialog integration.
- **Recent Captures History**: Quick gallery of previous screenshots stored locally in Chrome storage.

---

## 🚀 How to Install in Google Chrome

1. Open Google Chrome.
2. In the address bar, type `chrome://extensions` and press **Enter**.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left corner.
5. Select the directory:
   ```
   D:\chrome-extension\full-page-screenshot
   ```
6. The extension icon will appear in your Chrome toolbar. Click the puzzle icon 🧩 in Chrome and pin **SnapFull** to your toolbar for quick access!

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Capture Full Webpage |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> | Capture Visible Viewport |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Capture Selected Region |
| <kbd>Space</kbd> + Drag | Pan across large screenshots in Studio |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo annotation |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo annotation |
| <kbd>Ctrl</kbd> + <kbd>Wheel</kbd> | Zoom in / Zoom out |
| <kbd>Esc</kbd> | Cancel Region or Element selection |

---

## 📂 Project Structure

```
full-page-screenshot/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── background.js        # Background Service Worker (captures, stitching, storage)
├── content.js           # Page measurement, scrolling orchestration & overlays
├── content.css          # Styling for HUD, region crosshair, element highlight
├── popup.html           # Modern popup UI with capture cards & settings
├── popup.css            # Popup stylesheet
├── popup.js             # Popup event controller & history manager
├── viewer.html          # Screenshot Viewer & Annotation Studio
├── viewer.css           # Studio styling (floating tools, canvas stage)
├── viewer.js            # Canvas rendering engine, tools & history stack
├── pdf-export.js        # Pure JS PDF generator (Continuous & A4 multi-page)
├── icons/               # 16x16, 32x32, 48x48, 128x128 extension icons
└── README.md            # Installation and user guide
```

---

## 🔒 Privacy & Permissions

- **100% Offline & Private**: All screen captures and annotations are rendered locally inside your browser using HTML5 Canvas and Chrome APIs.
- **Zero External Tracking**: No telemetry, analytics, or third-party servers.
- **Permissions Used**:
  - `activeTab` & `scripting`: Required to scroll the current tab and capture viewport slices.
  - `storage`: Required to save user preferences and local screenshot history.
  - `downloads`: Required to save PNG, JPG, and PDF exports to your device.
  - `tabs`: Required to open the full-screen Annotation Studio tab.
