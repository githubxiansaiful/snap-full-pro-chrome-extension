const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Pure Node.js PNG generator using CRC32 and zlib
function createPNG(width, height, renderPixel) {
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const compressed = zlib.deflateSync(rawData);
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

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

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

const outDir = path.join(__dirname, 'promo-assets');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Small Promo Tile (440x280)
console.log('Generating small promo tile (440x280)...');
const smallTile = createPNG(440, 280, (x, y, w, h) => {
  const nx = x / w;
  const ny = y / h;

  // Rich gradient background: Deep Slate to Indigo
  const grad = nx * 0.5 + ny * 0.5;
  let r = 15 * (1 - grad) + 49 * grad;
  let g = 23 * (1 - grad) + 46 * grad;
  let b = 42 * (1 - grad) + 129 * grad;

  // Center badge card
  const cx = nx - 0.5;
  const cy = ny - 0.44;
  const dist = Math.sqrt(cx * cx + cy * cy);

  if (dist < 0.22) {
    // Camera Aperture Glow
    const ring = Math.abs(dist - 0.12);
    if (ring < 0.02) {
      return [56, 189, 248, 255]; // Cyan ring
    }
    if (dist < 0.05) {
      return [99, 102, 241, 255]; // Center core
    }
    return [30, 41, 59, 255];
  }

  // Subtle bottom accent bar
  if (ny > 0.88) {
    return [99, 102, 241, 255];
  }

  return [r, g, b, 255];
});
fs.writeFileSync(path.join(outDir, 'promo-small-440x280.png'), smallTile);

// 2. Marquee Promo Tile (1400x560)
console.log('Generating marquee promo banner (1400x560)...');
const marqueeBanner = createPNG(1400, 560, (x, y, w, h) => {
  const nx = x / w;
  const ny = y / h;

  // Vibrant futuristic dark gradient
  const grad = nx * 0.7 + ny * 0.3;
  let r = 10 * (1 - grad) + 67 * grad;
  let g = 15 * (1 - grad) + 56 * grad;
  let b = 30 * (1 - grad) + 202 * grad;

  // Camera lens graphic on left
  const lx = nx - 0.28;
  const ly = ny - 0.5;
  const ldist = Math.sqrt(lx * lx + ly * ly);

  if (ldist < 0.24) {
    if (Math.abs(ldist - 0.16) < 0.015) {
      return [6, 182, 212, 255];
    }
    if (Math.abs(ldist - 0.08) < 0.012) {
      return [99, 102, 241, 255];
    }
    if (ldist < 0.035) {
      return [255, 255, 255, 255];
    }
  }

  // Accent line
  if (ny > 0.94) {
    return [56, 189, 248, 255];
  }

  return [r, g, b, 255];
});
fs.writeFileSync(path.join(outDir, 'promo-marquee-1400x560.png'), marqueeBanner);

// 3. Store Showcase Screenshots (1280x800)
console.log('Generating CWS Showcase Screenshots (1280x800)...');

// Screenshot 1: Full Page Capture Showcase
const ss1 = createPNG(1280, 800, (x, y, w, h) => {
  const nx = x / w;
  const ny = y / h;

  // Background gradient
  const bg = [15, 23, 42, 255];

  // Browser Window Mockup
  if (nx > 0.1 && nx < 0.9 && ny > 0.08 && ny < 0.92) {
    // Window header
    if (ny < 0.14) {
      // Traffic lights
      if (nx > 0.12 && nx < 0.16 && ny > 0.10 && ny < 0.12) {
        return [244, 63, 94, 255];
      }
      return [30, 41, 59, 255];
    }
    // Webpage content slice
    if (nx > 0.15 && nx < 0.85 && ny > 0.18 && ny < 0.86) {
      // Clean white page preview
      if ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0) {
        return [248, 250, 252, 255];
      }
      return [241, 245, 249, 255];
    }
    return [30, 41, 59, 255];
  }

  return bg;
});
fs.writeFileSync(path.join(outDir, 'screenshot-1-fullpage-1280x800.png'), ss1);

// Screenshot 2: Annotation Studio & Markup Showcase
const ss2 = createPNG(1280, 800, (x, y, w, h) => {
  const nx = x / w;
  const ny = y / h;
  const bg = [9, 13, 22, 255];

  // Top header bar
  if (ny < 0.08) {
    return [15, 23, 42, 255];
  }

  // Floating left tool rail
  if (nx > 0.02 && nx < 0.06 && ny > 0.12 && ny < 0.7) {
    return [30, 41, 59, 255];
  }

  // Floating property bar
  if (nx > 0.08 && nx < 0.5 && ny > 0.12 && ny < 0.18) {
    return [30, 41, 59, 255];
  }

  // Central canvas preview
  if (nx > 0.15 && nx < 0.85 && ny > 0.22 && ny < 0.88) {
    // Drawn shapes on canvas:
    // Red box
    if (nx > 0.25 && nx < 0.45 && ny > 0.35 && ny < 0.55) {
      if (nx < 0.26 || nx > 0.44 || ny < 0.36 || ny > 0.54) {
        return [244, 63, 94, 255]; // Red stroke
      }
    }
    // Arrow
    if (nx > 0.48 && nx < 0.65 && Math.abs(ny - 0.45) < 0.008) {
      return [56, 189, 248, 255]; // Cyan arrow
    }
    // Step badge (1)
    const bdx = nx - 0.25;
    const bdy = ny - 0.35;
    if (bdx * bdx + bdy * bdy < 0.0006) {
      return [99, 102, 241, 255];
    }
    return [255, 255, 255, 255];
  }

  return bg;
});
fs.writeFileSync(path.join(outDir, 'screenshot-2-annotation-studio-1280x800.png'), ss2);

console.log('All promotional assets generated successfully in promo-assets/ folder!');
