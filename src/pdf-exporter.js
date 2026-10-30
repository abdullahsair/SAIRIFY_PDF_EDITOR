import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

/**
 * Parses a CSS hex/rgb/rgba color to pdf-lib rgb(r, g, b) & opacity
 */
function parseColor(colorStr, defaultOpacity = 1) {
  if (!colorStr) return { color: rgb(0, 0, 0), opacity: defaultOpacity };
  
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    const r = ((num >> 16) & 255) / 255;
    const g = ((num >> 8) & 255) / 255;
    const b = (num & 255) / 255;
    return { color: rgb(r, g, b), opacity: defaultOpacity };
  }
  
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10) / 255;
    const g = parseInt(rgbaMatch[2], 10) / 255;
    const b = parseInt(rgbaMatch[3], 10) / 255;
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : defaultOpacity;
    return { color: rgb(r, g, b), opacity: a };
  }
  
  return { color: rgb(0, 0, 0), opacity: defaultOpacity };
}

/**
 * Converts a data URL (PNG/JPEG) to Uint8Array
 */
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Export modified PDF with all annotations, drawings, whiteouts, and text baked in
 */
export async function exportModifiedPdf({
  originalPdfBytes,
  pageAnnotations, // Map of pageIndex -> Array of annotations
  pageRotations,   // Map of pageIndex -> rotation angle (0, 90, 180, 270)
  deletedPages,    // Set of pageIndex
  addedPages = []  // Array of added blank pages info
}) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);

  // Embed standard fonts for text annotations
  const fonts = {
    helvetica: await pdfDoc.embedFont(StandardFonts.Helvetica),
    helveticaBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    helveticaOblique: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    times: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    timesBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    courier: await pdfDoc.embedFont(StandardFonts.Courier),
    courierBold: await pdfDoc.embedFont(StandardFonts.CourierBold)
  };

  const pages = pdfDoc.getPages();

  // Process existing pages
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    
    // Apply page rotation if any
    const extraRot = (pageRotations && pageRotations[pageIdx]) || 0;
    if (extraRot !== 0) {
      const currentRot = page.getRotation().angle;
      page.setRotation(degrees((currentRot + extraRot) % 360));
    }

    const annotations = (pageAnnotations && pageAnnotations[pageIdx]) || [];
    if (!annotations || annotations.length === 0) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();

    for (const item of annotations) {
      try {
        if (item.type === 'whiteout') {
          // Erases existing text with a clean opaque white rectangle
          const scaleX = pageWidth / item.pageRenderWidth;
          const scaleY = pageHeight / item.pageRenderHeight;

          const boxX = item.x * scaleX;
          const boxW = item.width * scaleX;
          const boxH = item.height * scaleY;
          // In PDF, Y=0 is bottom-left
          const boxY = pageHeight - (item.y * scaleY + boxH);

          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: boxW,
            height: boxH,
            color: rgb(1, 1, 1),
            borderWidth: 0
          });
        } 
        else if (item.type === 'redact') {
          // Blackout confidential box
          const scaleX = pageWidth / item.pageRenderWidth;
          const scaleY = pageHeight / item.pageRenderHeight;

          const boxX = item.x * scaleX;
          const boxW = item.width * scaleX;
          const boxH = item.height * scaleY;
          const boxY = pageHeight - (item.y * scaleY + boxH);

          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: boxW,
            height: boxH,
            color: rgb(0, 0, 0),
            borderWidth: 0
          });
        }
        else if (item.type === 'highlight-box') {
          // Translucent highlighter rectangle
          const scaleX = pageWidth / item.pageRenderWidth;
          const scaleY = pageHeight / item.pageRenderHeight;

          const boxX = item.x * scaleX;
          const boxW = item.width * scaleX;
          const boxH = item.height * scaleY;
          const boxY = pageHeight - (item.y * scaleY + boxH);

          const { color } = parseColor(item.color || '#ffe066');
          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: boxW,
            height: boxH,
            color: color,
            opacity: item.opacity || 0.4
          });
        }
        else if (item.type === 'shape') {
          const scaleX = pageWidth / item.pageRenderWidth;
          const scaleY = pageHeight / item.pageRenderHeight;

          const boxX = item.x * scaleX;
          const boxW = item.width * scaleX;
          const boxH = item.height * scaleY;
          const boxY = pageHeight - (item.y * scaleY + boxH);
          const strokeInfo = parseColor(item.strokeColor || '#E5252A');

          if (item.shapeType === 'rectangle') {
            const hasFill = item.fillColor && item.fillColor !== 'transparent';
            page.drawRectangle({
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH,
              borderColor: strokeInfo.color,
              borderWidth: (item.strokeWidth || 2) * scaleX,
              color: hasFill ? parseColor(item.fillColor).color : undefined,
              opacity: hasFill ? 1 : undefined,
              borderOpacity: strokeInfo.opacity
            });
          } else if (item.shapeType === 'circle') {
            const cx = boxX + boxW / 2;
            const cy = boxY + boxH / 2;
            const rx = Math.abs(boxW / 2);
            const ry = Math.abs(boxH / 2);
            const hasFill = item.fillColor && item.fillColor !== 'transparent';

            page.drawEllipse({
              x: cx,
              y: cy,
              xScale: rx,
              yScale: ry,
              borderColor: strokeInfo.color,
              borderWidth: (item.strokeWidth || 2) * scaleX,
              color: hasFill ? parseColor(item.fillColor).color : undefined,
              borderOpacity: strokeInfo.opacity
            });
          } else if (item.shapeType === 'line' || item.shapeType === 'arrow') {
            const startX = item.startX * scaleX;
            const startY = pageHeight - (item.startY * scaleY);
            const endX = item.endX * scaleX;
            const endY = pageHeight - (item.endY * scaleY);

            page.drawLine({
              start: { x: startX, y: startY },
              end: { x: endX, y: endY },
              thickness: (item.strokeWidth || 2) * scaleX,
              color: strokeInfo.color,
              opacity: strokeInfo.opacity
            });

            if (item.shapeType === 'arrow') {
              // Draw arrow head
              const angle = Math.atan2(endY - startY, endX - startX);
              const headLen = 14 * scaleX;
              page.drawLine({
                start: { x: endX, y: endY },
                end: {
                  x: endX - headLen * Math.cos(angle - Math.PI / 6),
                  y: endY - headLen * Math.sin(angle - Math.PI / 6)
                },
                thickness: (item.strokeWidth || 2) * scaleX,
                color: strokeInfo.color
              });
              page.drawLine({
                start: { x: endX, y: endY },
                end: {
                  x: endX - headLen * Math.cos(angle + Math.PI / 6),
                  y: endY - headLen * Math.sin(angle + Math.PI / 6)
                },
                thickness: (item.strokeWidth || 2) * scaleX,
                color: strokeInfo.color
              });
            }
          }
        }
        else if (item.type === 'text') {
          const scaleX = pageWidth / item.pageRenderWidth;
          const scaleY = pageHeight / item.pageRenderHeight;

          let selectedFont = fonts.helvetica;
          if (item.fontFamily === 'Times') {
            selectedFont = item.bold ? fonts.timesBold : fonts.times;
          } else if (item.fontFamily === 'Courier') {
            selectedFont = item.bold ? fonts.courierBold : fonts.courier;
          } else {
            if (item.bold && item.italic) selectedFont = fonts.helveticaBold;
            else if (item.bold) selectedFont = fonts.helveticaBold;
            else if (item.italic) selectedFont = fonts.helveticaOblique;
            else selectedFont = fonts.helvetica;
          }

          const fontSize = (item.fontSize || 14) * scaleY;
          const { color, opacity } = parseColor(item.color || '#000000');
          const lines = (item.text || '').split('\n');
          const lineHeight = fontSize * 1.25;

          const startX = item.x * scaleX;
          // In PDF, Y coordinate corresponds to text baseline!
          let currentY = pageHeight - (item.y * scaleY + fontSize);

          for (const line of lines) {
            page.drawText(line, {
              x: startX,
              y: currentY,
              size: fontSize,
              font: selectedFont,
              color: color,
              opacity: opacity
            });
            currentY -= lineHeight;
          }
        }
        else if (item.type === 'raster-layer' || item.type === 'signature' || item.type === 'image' || item.type === 'stamp') {
          // Freehand drawings, signatures, or inserted images
          if (item.dataUrl) {
            const imgBytes = dataUrlToBytes(item.dataUrl);
            let embeddedImage;
            if (item.dataUrl.startsWith('data:image/jpeg') || item.dataUrl.startsWith('data:image/jpg')) {
              embeddedImage = await pdfDoc.embedJpg(imgBytes);
            } else {
              embeddedImage = await pdfDoc.embedPng(imgBytes);
            }

            const scaleX = pageWidth / item.pageRenderWidth;
            const scaleY = pageHeight / item.pageRenderHeight;

            const imgX = item.x * scaleX;
            const imgW = item.width * scaleX;
            const imgH = item.height * scaleY;
            const imgY = pageHeight - (item.y * scaleY + imgH);

            page.drawImage(embeddedImage, {
              x: imgX,
              y: imgY,
              width: imgW,
              height: imgH,
              opacity: item.opacity || 1
            });
          }
        }
      } catch (err) {
        console.error('Error rendering annotation item into PDF page:', item, err);
      }
    }
  }

  // Handle deleted pages (delete from highest index to lowest)
  if (deletedPages && deletedPages.size > 0) {
    const sortedIndices = Array.from(deletedPages).sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      if (idx < pdfDoc.getPageCount() && pdfDoc.getPageCount() > 1) {
        pdfDoc.removePage(idx);
      }
    }
  }

  // Save and generate finalized PDF bytes
  const finalPdfBytes = await pdfDoc.save();
  return finalPdfBytes;
}

/**
 * Triggers standard browser download for a PDF byte array
 */
export function downloadPdfFile(pdfBytes, filename = 'edited_document.pdf') {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
