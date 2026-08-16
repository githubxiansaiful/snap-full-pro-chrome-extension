# Privacy Policy for SnapFull - Full Page Screen Capture

**Last updated:** August 17, 2026

SnapFull ("we", "our", or "the Extension") is committed to protecting your privacy. This Privacy Policy explains how SnapFull handles user information.

---

## 1. Single Purpose & Local Execution
SnapFull is a browser utility designed exclusively to capture screenshots of web pages (full page, visible area, selected regions, or DOM elements) and provide offline annotation and export tools (PNG, JPEG, PDF, Clipboard).

**All processing is performed 100% locally on your device.**

---

## 2. No Data Collection or Transmission
- **We do not collect any personal information.**
- **We do not track your browsing history or website activity.**
- **We do not use analytics, telemetries, tracking pixels, or third-party cookies.**
- **We do not operate external backend servers or transmit your screenshots over the internet.**

Screenshots and annotations remain exclusively within your browser's local memory and local IndexedDB database on your device.

---

## 3. Permissions Used & Justifications

SnapFull requests only the minimum permissions necessary to perform its core functions:

- **`activeTab`**: Allows the extension to interact with the currently open tab to measure page scroll dimensions and trigger screen capture when invoked by the user.
- **`scripting`**: Used to inject temporary page-scrolling choreography and selection overlay frames on the active tab during capture.
- **`storage` & `unlimitedStorage`**: Used to store user preferences (e.g. scroll delay, default export format) and local screenshot history within your browser's local storage/IndexedDB. No data is synced to external servers.
- **`downloads`**: Enables saving exported screenshot files (PNG, JPEG, PDF) directly to your local computer's Downloads folder upon your request.
- **`tabs`**: Used to open the full-screen Studio Annotation Editor tab (`viewer.html`) to view and mark up captured screenshots.

---

## 4. Third-Party Services
SnapFull contains zero third-party dependencies, CDNs, or external tracking services. It runs fully offline.

---

## 5. Contact
If you have any questions regarding this Privacy Policy or SnapFull, you can open an issue on the project repository or contact the extension publisher.
