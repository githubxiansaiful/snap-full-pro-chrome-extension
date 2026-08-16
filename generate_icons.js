const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Pure Node.js PNG generator using crc32 & zlib
function createPNG(width, height, renderPixel) {
  // Render RGBA buffer
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body), 0);

    return Buffer.concat([len, body, crcBuf]);
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // Color type 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Simple CRC32 implementation
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }

  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// Render icon design: Modern gradient background with camera aperture / crop capture viewfinder
function renderAppIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;

  // Distance from center for rounded squircle
  const dx = Math.abs(nx - cx);
  const dy = Math.abs(ny - cy);
  const cornerR = 0.22;
  let inSquircle = false;

  if (dx < (0.46 - cornerR) && dy < 0.46) {
    inSquircle = true;
  } else if (dy < (0.46 - cornerR) && dx < 0.46) {
    inSquircle = true;
  } else {
    const cdx = dx - (0.46 - cornerR);
    const cdy = dy - (0.46 - cornerR);
    if (cdx * cdx + cdy * cdy <= cornerR * cornerR) {
      inSquircle = true;
    }
  }

  if (!inSquircle) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Gradient background: Electric Indigo to Vivid Cyan
  // (0,0) = #4F46E5 (rgb: 79, 70, 229) to (1,1) = #06B6D4 (rgb: 6, 182, 212)
  const gradT = (nx * 0.6 + ny * 0.4);
  let r = 79 * (1 - gradT) + 6 * gradT;
  let g = 70 * (1 - gradT) + 182 * gradT;
  let b = 229 * (1 - gradT) + 212 * gradT;
  let a = 255;

  // Subtle border highlight
  if (dx > 0.43 || dy > 0.43) {
    r = Math.min(255, r + 40);
    g = Math.min(255, g + 40);
    b = Math.min(255, b + 40);
  }

  // Draw Viewfinder / Camera Lens & Capture Bracket Icon
  const relX = nx - 0.5;
  const relY = ny - 0.5;
  const distCenter = Math.sqrt(relX * relX + relY * relY);

  // Outer Lens Ring
  if (distCenter >= 0.16 && distCenter <= 0.23) {
    return [255, 255, 255, 240];
  }

  // Center Shutter Dot
  if (distCenter <= 0.09) {
    return [255, 255, 255, 255];
  }

  // Corner crop brackets:
  const absX = Math.abs(relX);
  const absY = Math.abs(relY);

  // Top-left, top-right, bottom-left, bottom-right viewfinder brackets
  const isBracketX = (absX >= 0.26 && absX <= 0.33);
  const isBracketY = (absY >= 0.26 && absY <= 0.33);
  const isCornerX = (absX >= 0.30 && absX <= 0.33);
  const isCornerY = (absY >= 0.30 && absY <= 0.33);

  if ((isBracketX && isCornerY) || (isBracketY && isCornerX)) {
    return [255, 255, 255, 245];
  }

  // Flash dot top-right
  const flashDx = nx - 0.72;
  const flashDy = ny - 0.28;
  if (flashDx * flashDx + flashDy * flashDy <= 0.0016) {
    return [250, 204, 21, 255]; // Yellow flash dot
  }

  return [r, g, b, a];
}

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  const pngBuffer = createPNG(size, size, renderAppIcon);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated icon: ${filePath} (${size}x${size}, ${pngBuffer.length} bytes)`);
});
