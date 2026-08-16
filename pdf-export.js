/**
 * Pure JavaScript PDF Exporter for Screenshots
 * Supports both Single Continuous Page & Multi-page A4 Paginated formats.
 * Zero external dependencies, 100% offline and compliant with PDF 1.4 spec.
 */

class MiniPDFExport {
  /**
   * Convert canvas to a single continuous PDF matching image aspect ratio
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options - { quality: 0.92, title: 'Screenshot' }
   * @returns {Promise<Blob>}
   */
  static async canvasToContinuousPDF(canvas, options = {}) {
    const quality = options.quality || 0.92;
    const title = options.title || 'Full Page Screenshot';
    
    // Get JPEG data from canvas
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64Data = dataUrl.split(',')[1];
    const binaryData = atob(base64Data);
    const imgBytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      imgBytes[i] = binaryData.charCodeAt(i);
    }

    // Convert pixel dimensions to points (72 points per inch; standard screen 96 DPI -> 72/96 = 0.75 pt/px)
    const ptWidth = Math.round(canvas.width * 0.75);
    const ptHeight = Math.round(canvas.height * 0.75);

    // Build PDF objects
    const objects = [];
    const offsets = [];

    function addObject(content) {
      const objNum = objects.length + 1;
      objects.push({ num: objNum, content });
      return objNum;
    }

    // Object 1: Catalog
    addObject(`<< /Type /Catalog /Pages 2 0 R >>`);

    // Object 2: Pages
    addObject(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);

    // Object 3: Page
    addObject(`<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 ${ptWidth} ${ptHeight}]
  /Resources <<
    /XObject << /Im1 4 0 R >>
    /ProcSet [/PDF /ImageC]
  >>
  /Contents 5 0 R
>>`);

    // Object 4: Image XObject (with raw JPEG stream)
    const imageHeader = `<<
  /Type /XObject
  /Subtype /Image
  /Width ${canvas.width}
  /Height ${canvas.height}
  /ColorSpace /DeviceRGB
  /BitsPerComponent 8
  /Filter /DCTDecode
  /Length ${imgBytes.length}
>>
stream\n`;
    const imageFooter = `\nendstream`;
    objects.push({
      num: 4,
      isRawStream: true,
      header: imageHeader,
      streamBytes: imgBytes,
      footer: imageFooter
    });

    // Object 5: Content stream (Scale and draw image)
    const contentStream = `q\n${ptWidth} 0 0 ${ptHeight} 0 0 cm\n/Im1 Do\nQ`;
    addObject(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);

    // Object 6: Info
    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    addObject(`<<
  /Title (${escapePdfText(title)})
  /Producer (Full Page Screen Capture Pro)
  /CreationDate (D:${dateStr}Z)
>>`);

    return assemblePDF(objects);
  }

  /**
   * Convert canvas to multi-page A4 PDF (sliced vertically)
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   * @returns {Promise<Blob>}
   */
  static async canvasToA4PDF(canvas, options = {}) {
    const quality = options.quality || 0.92;
    const title = options.title || 'Full Page Screenshot';

    // A4 dimensions in points: 595.28 x 841.89 (at 72 DPI)
    const a4WidthPt = 595.28;
    const a4HeightPt = 841.89;
    const marginPt = 20; // 20pt margin
    const contentWidthPt = a4WidthPt - (marginPt * 2);
    const contentHeightPt = a4HeightPt - (marginPt * 2);

    // Calculate scaling factor from canvas width to page content width
    const scale = contentWidthPt / canvas.width;
    const sliceHeightPx = Math.floor(contentHeightPt / scale);
    const totalPages = Math.ceil(canvas.height / sliceHeightPx);

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;

    const pageImages = [];

    for (let p = 0; p < totalPages; p++) {
      const startY = p * sliceHeightPx;
      const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - startY);
      pageCanvas.height = currentSliceHeight;

      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = '#FFFFFF';
      pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pctx.drawImage(canvas, 0, startY, canvas.width, currentSliceHeight, 0, 0, canvas.width, currentSliceHeight);

      const sliceDataUrl = pageCanvas.toDataURL('image/jpeg', quality);
      const b64 = sliceDataUrl.split(',')[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }

      pageImages.push({
        width: pageCanvas.width,
        height: currentSliceHeight,
        ptWidth: Math.round(canvas.width * scale),
        ptHeight: Math.round(currentSliceHeight * scale),
        bytes
      });
    }

    const objects = [];

    function addObject(content) {
      const objNum = objects.length + 1;
      objects.push({ num: objNum, content });
      return objNum;
    }

    // Obj 1: Catalog
    addObject(`<< /Type /Catalog /Pages 2 0 R >>`);

    // Obj 2: Pages placeholder (will update kids)
    const pagesObjNum = 2;
    objects.push(null); // will replace

    const pageObjNums = [];

    for (let i = 0; i < totalPages; i++) {
      const pageInfo = pageImages[i];
      const imgObjNum = objects.length + 1;
      const contentObjNum = imgObjNum + 1;
      const thisPageObjNum = contentObjNum + 1;
      pageObjNums.push(thisPageObjNum);

      // Image XObject
      const imgHeader = `<<
  /Type /XObject
  /Subtype /Image
  /Width ${pageInfo.width}
  /Height ${pageInfo.height}
  /ColorSpace /DeviceRGB
  /BitsPerComponent 8
  /Filter /DCTDecode
  /Length ${pageInfo.bytes.length}
>>
stream\n`;
      objects.push({
        num: imgObjNum,
        isRawStream: true,
        header: imgHeader,
        streamBytes: pageInfo.bytes,
        footer: `\nendstream`
      });

      // Content stream
      const posX = marginPt;
      const posY = a4HeightPt - marginPt - pageInfo.ptHeight;
      const cStream = `q\n${pageInfo.ptWidth} 0 0 ${pageInfo.ptHeight} ${posX} ${posY} cm\n/Im${i + 1} Do\nQ`;
      objects.push({
        num: contentObjNum,
        content: `<< /Length ${cStream.length} >>\nstream\n${cStream}\nendstream`
      });

      // Page Obj
      objects.push({
        num: thisPageObjNum,
        content: `<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 ${a4WidthPt} ${a4HeightPt}]
  /Resources <<
    /XObject << /Im${i + 1} ${imgObjNum} 0 R >>
    /ProcSet [/PDF /ImageC]
  >>
  /Contents ${contentObjNum} 0 R
>>`
      });
    }

    // Set Pages Object
    const kidsStr = pageObjNums.map(n => `${n} 0 R`).join(' ');
    objects[1] = {
      num: 2,
      content: `<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>`
    };

    // Info Obj
    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    addObject(`<<
  /Title (${escapePdfText(title)})
  /Producer (Full Page Screen Capture Pro)
  /CreationDate (D:${dateStr}Z)
>>`);

    return assemblePDF(objects);
  }
}

function escapePdfText(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function assemblePDF(objects) {
  const chunks = [];
  let currentOffset = 0;

  function writeAscii(str) {
    const encoder = new TextEncoder();
    const u8 = encoder.encode(str);
    chunks.push(u8);
    currentOffset += u8.length;
  }

  function writeBytes(u8) {
    chunks.push(u8);
    currentOffset += u8.length;
  }

  // Header
  writeAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    offsets.push(currentOffset);
    writeAscii(`${obj.num} 0 obj\n`);
    if (obj.isRawStream) {
      writeAscii(obj.header);
      writeBytes(obj.streamBytes);
      writeAscii(obj.footer + '\n');
    } else {
      writeAscii(obj.content + '\n');
    }
    writeAscii('endobj\n');
  }

  const xrefOffset = currentOffset;
  writeAscii(`xref\n0 ${objects.length + 1}\n`);
  writeAscii('0000000000 65535 f \n');
  for (let i = 0; i < offsets.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    writeAscii(`${offStr} 00000 n \n`);
  }

  writeAscii(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`);
  writeAscii(`startxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MiniPDFExport;
}
