# Google Chrome Web Store Listing Guide for SnapFull

Copy and paste these exact details into the **Chrome Web Store Developer Dashboard** (`https://chrome.google.com/webstore/devconsole`).

---

## 1. Product Details

### **Extension Name**
```
SnapFull - Full Page Screen Capture & Studio
```

### **Summary / Short Description** *(Max 132 chars)*
```
Capture full web pages, visible areas, or elements. Annotate, crop, blur, and export to PNG, JPEG, PDF or clipboard instantly.
```

### **Detailed Description**
```markdown
Capture entire full-length web pages, visible viewports, custom regions, or individual DOM elements with crystal-clear pixel perfection. SnapFull includes a built-in Annotation Studio, blur/redact tools, and instant export to PNG, JPEG, Single Continuous PDF, or Multi-Page A4 PDF.

100% Offline & Private: SnapFull processes all images directly in your browser. Zero tracking, zero telemetry, and zero third-party servers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📸 4 POWERFUL CAPTURE MODES
• Full Webpage Screenshot: Automatically scrolls through long web pages, hides duplicate fixed/sticky headers, and stitches high-resolution slices seamlessly.
• Visible Viewport Capture: Instantly grab what's currently on your screen with one click.
• Selected Region: Drag interactive crosshairs with real-time pixel dimension readouts to crop any area.
• DOM Element Picker: Hover over any HTML element (cards, hero banners, tables) and click to capture.
• Countdown Timer: 3s, 5s, or 10s timer for capturing dropdown menus, tooltips, and hover states.

🎨 FULL-FEATURED ANNOTATION STUDIO
• Live Crop Tool: 8-point interactive bounding box to re-crop anytime.
• Shapes & Markups: Rectangles, circles/ellipses, straight lines, and crisp directional vector arrows.
• Pen & Highlighter: Smooth freehand sketch pen and translucent marker highlights.
• Text Tool: Add styled text callouts with contrasting background badges.
• Step Badges: Numbered circular badges (1, 2, 3, 4...) that auto-increment with every click.
• Blur & Pixelate Redaction: Drag a box over passwords, credit cards, or emails to obscure sensitive information directly on the canvas.
• Multi-Level Undo & Redo: Complete state history with Ctrl+Z and Ctrl+Y shortcuts.
• Smooth Zoom & Pan: Zoom from 10% to 300% (Ctrl+Wheel) and fluid Spacebar pan navigation.

💾 INSTANT EXPORT & SHARING
• Copy to Clipboard: Instant one-click copy to paste directly into Slack, Notion, Google Docs, Figma, or Jira.
• Download PNG: Lossless crystal-clear image.
• Download JPEG: Lightweight compressed file with adjustable quality.
• Export Continuous PDF: Single continuous PDF matching the exact length of long webpages.
• Export A4 Paginated PDF: Automatically slices long screenshots into printable multi-page A4 documents with margins.
• Print: One-click browser print integration.
• Local History: Quickly browse and reload past captures saved in your browser's private local database.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⌨️ DEFAULT KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Alt + Shift + F ➔ Capture Full Webpage
• Alt + Shift + V ➔ Capture Visible Viewport
• Alt + Shift + S ➔ Capture Selected Region
• Ctrl + Z / Ctrl + Y ➔ Undo / Redo in Studio
• Space + Drag ➔ Pan Canvas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 100% PRIVATE & OFFLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SnapFull operates 100% on the client side using HTML5 Canvas and browser APIs. Your screenshots are never transmitted to any external server.
```

### **Category**
- **Primary Category:** `Productivity` (or `Photos`)

---

## 2. Privacy & Permission Justifications (For Review Submission)

When filling out the **Privacy** tab in the Developer Dashboard, use these official justifications:

### **Single Purpose Description**
```
SnapFull is a single-purpose utility designed to capture full-page and regional screenshots of web pages, allowing users to annotate, redact, and export them locally.
```

### **Permission Justifications**
- **`activeTab`**: Required to measure scroll dimensions and initiate screen capture on the user's currently focused webpage when the extension action is triggered.
- **`scripting`**: Required to execute temporary page scrolling and inject the selection overlay for regional and DOM element capture.
- **`storage` & `unlimitedStorage`**: Required to store user configuration preferences and local screenshot history in IndexedDB/browser memory without quota limitations. No data leaves the device.
- **`downloads`**: Required to download exported PNG, JPEG, and PDF screenshot files to the user's computer.
- **`tabs`**: Required to open the full-screen Studio Annotation Editor tab when a screenshot is captured.

### **User Data Declarations**
- **Do you collect any user data?** ➔ **No** (Check "I certify that my extension does not collect or use user data").
- **Account / Personally Identifiable Information:** ➔ Not collected.
- **Health / Financial / Authentication / Web History:** ➔ Not collected.
