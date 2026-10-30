import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generates an elegant sample PDF document for immediate testing
 * Contains typical document sections: Header, Invoice/Agreement details, editable fields
 */
export async function createSamplePdf() {
  const pdfDoc = await PDFDocument.create();
  
  // Page 1: Business Proposal & Agreement
  const page1 = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const { width, height } = page1.getSize();

  // Top banner
  page1.drawRectangle({
    x: 0,
    y: height - 110,
    width: width,
    height: 110,
    color: rgb(0.08, 0.11, 0.16)
  });

  // Top accent line
  page1.drawRectangle({
    x: 0,
    y: height - 115,
    width: width,
    height: 5,
    color: rgb(0.9, 0.15, 0.16) // Adobe red accent
  });

  // Header Title
  page1.drawText('ACROBAT STUDIO - SAMPLE DOCUMENT', {
    x: 40,
    y: height - 55,
    size: 20,
    font: helveticaBold,
    color: rgb(1, 1, 1)
  });

  page1.drawText('Professional PDF Editing & Annotation Platform', {
    x: 40,
    y: height - 80,
    size: 11,
    font: helvetica,
    color: rgb(0.8, 0.85, 0.9)
  });

  // Date and Reference
  page1.drawText('Doc ID: ACRO-2026-8849', {
    x: width - 200,
    y: height - 55,
    size: 10,
    font: helveticaBold,
    color: rgb(0.9, 0.9, 0.9)
  });
  page1.drawText('Date: October 30, 2026', {
    x: width - 200,
    y: height - 72,
    size: 10,
    font: helvetica,
    color: rgb(0.7, 0.75, 0.8)
  });

  // Introduction block
  let y = height - 160;
  page1.drawText('Welcome to your PDF Editor & Reader!', {
    x: 40,
    y: y,
    size: 16,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.25)
  });

  y -= 25;
  const introText = [
    'This is a fully editable sample document. You can open any PDF from your computer,',
    'edit text, erase or whiteout unwanted content, add annotations, insert shapes, draw',
    'your digital signature, and export the modified PDF with 100% fidelity.'
  ];
  for (const line of introText) {
    page1.drawText(line, {
      x: 40,
      y: y,
      size: 11,
      font: helvetica,
      color: rgb(0.3, 0.35, 0.4)
    });
    y -= 18;
  }

  // Feature Highlights Box
  y -= 15;
  page1.drawRectangle({
    x: 40,
    y: y - 130,
    width: width - 80,
    height: 140,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.85, 0.88, 0.93),
    borderWidth: 1
  });

  page1.drawText('KEY EDITING CAPABILITIES IN THIS SOFTWARE:', {
    x: 55,
    y: y - 10,
    size: 12,
    font: helveticaBold,
    color: rgb(0.85, 0.15, 0.15)
  });

  const features = [
    '• Add Text: Click anywhere to insert custom text with any font size and color.',
    '• Whiteout / Erase: Draw a clean white box over existing text to erase and replace it.',
    '• Freehand Drawing & Pen: Add handwritten notes, arrows, or annotations.',
    '• Highlighter: Highlight key clauses, sentences, or numbers in bright translucent color.',
    '• Digital Signatures: Draw your handwritten signature and stamp it onto the document.',
    '• Shapes & Redaction: Draw rectangles, circles, lines, or blackout sensitive information.'
  ];

  let fy = y - 30;
  for (const feat of features) {
    page1.drawText(feat, {
      x: 55,
      y: fy,
      size: 9.5,
      font: helvetica,
      color: rgb(0.2, 0.25, 0.3)
    });
    fy -= 17;
  }

  // Interactive Test Area
  y = y - 170;
  page1.drawText('Interactive Test Section (Try Editing Here):', {
    x: 40,
    y: y,
    size: 13,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.25)
  });

  y -= 25;
  // Table header
  page1.drawRectangle({
    x: 40,
    y: y - 20,
    width: width - 80,
    height: 24,
    color: rgb(0.15, 0.2, 0.3)
  });

  page1.drawText('Item Description', { x: 50, y: y - 14, size: 10, font: helveticaBold, color: rgb(1, 1, 1) });
  page1.drawText('Status', { x: 280, y: y - 14, size: 10, font: helveticaBold, color: rgb(1, 1, 1) });
  page1.drawText('Client Action', { x: 420, y: y - 14, size: 10, font: helveticaBold, color: rgb(1, 1, 1) });

  const rows = [
    { desc: '1. Software License Agreement', status: 'Pending Review', action: 'Erase status & set Approved' },
    { desc: '2. Confidential NDA Clause', status: 'Needs Redaction', action: 'Blackout sensitive names' },
    { desc: '3. Scope of Work (Phase 1)', status: 'Approved', action: 'Highlight with yellow marker' },
    { desc: '4. Final Sign-off Authorization', status: 'Awaiting Signature', action: 'Add your signature below' }
  ];

  let ry = y - 44;
  for (const row of rows) {
    page1.drawRectangle({
      x: 40,
      y: ry,
      width: width - 80,
      height: 22,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.9, 0.92, 0.95),
      borderWidth: 0.5
    });

    page1.drawText(row.desc, { x: 50, y: ry + 6, size: 9, font: helvetica, color: rgb(0.15, 0.18, 0.22) });
    page1.drawText(row.status, { x: 280, y: ry + 6, size: 9, font: helveticaBold, color: rgb(0.8, 0.2, 0.2) });
    page1.drawText(row.action, { x: 420, y: ry + 6, size: 8.5, font: helveticaOblique, color: rgb(0.4, 0.45, 0.5) });
    ry -= 24;
  }

  // Signature box area
  ry -= 30;
  page1.drawText('Authorized Signature & Approval:', {
    x: 40,
    y: ry + 20,
    size: 11,
    font: helveticaBold,
    color: rgb(0.15, 0.2, 0.25)
  });

  // Client signature field box
  page1.drawRectangle({
    x: 40,
    y: ry - 60,
    width: 220,
    height: 70,
    borderColor: rgb(0.7, 0.75, 0.82),
    borderWidth: 1,
    borderDashArray: [4, 4],
    color: rgb(0.99, 0.99, 1)
  });
  page1.drawText('Sign Here (Use Signature Tool)', {
    x: 55,
    y: ry - 30,
    size: 10,
    font: helveticaOblique,
    color: rgb(0.6, 0.65, 0.7)
  });

  // Official Stamp field box
  page1.drawRectangle({
    x: 320,
    y: ry - 60,
    width: 220,
    height: 70,
    borderColor: rgb(0.7, 0.75, 0.82),
    borderWidth: 1,
    borderDashArray: [4, 4],
    color: rgb(0.99, 0.99, 1)
  });
  page1.drawText('Stamp Here (e.g. APPROVED)', {
    x: 345,
    y: ry - 30,
    size: 10,
    font: helveticaOblique,
    color: rgb(0.6, 0.65, 0.7)
  });

  // Footer
  page1.drawText('Page 1 of 2  •  Generated for Adobe Acrobat Style PDF Reader & Editor  •  All changes persist upon Download', {
    x: 50,
    y: 25,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.55, 0.6)
  });

  // Page 2: Terms & Notes
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  
  // Page 2 header
  page2.drawRectangle({
    x: 0,
    y: height - 60,
    width: width,
    height: 60,
    color: rgb(0.12, 0.15, 0.2)
  });
  page2.drawText('TERMS OF SERVICE & DOCUMENT SPECIFICATIONS', {
    x: 40,
    y: height - 38,
    size: 14,
    font: helveticaBold,
    color: rgb(1, 1, 1)
  });

  let p2y = height - 100;
  const notes = [
    { title: '1. Privacy and Local Processing', body: 'All files opened in this software are processed 100% locally on your machine. No documents are uploaded to external servers.' },
    { title: '2. High-Precision Vector Export', body: 'When you click "Download PDF", your edits (texts, whiteouts, drawings, shapes, signatures) are baked cleanly into standard PDF vectors and fonts.' },
    { title: '3. Full Page Management', body: 'You can rotate pages, add new blank pages, or delete unwanted pages using the thumbnail sidebar and toolbar.' }
  ];

  for (const n of notes) {
    page2.drawText(n.title, { x: 40, y: p2y, size: 12, font: helveticaBold, color: rgb(0.15, 0.2, 0.25) });
    p2y -= 18;
    page2.drawText(n.body, { x: 40, y: p2y, size: 10, font: helvetica, color: rgb(0.35, 0.4, 0.45) });
    p2y -= 35;
  }

  // Large Note box on Page 2 for user to practice
  page2.drawRectangle({
    x: 40,
    y: p2y - 220,
    width: width - 80,
    height: 220,
    borderColor: rgb(0.8, 0.83, 0.88),
    borderWidth: 1,
    color: rgb(0.98, 0.99, 1)
  });
  page2.drawText('FREE PRACTICE CANVAS (PAGE 2)', {
    x: 55,
    y: p2y - 25,
    size: 11,
    font: helveticaBold,
    color: rgb(0.3, 0.4, 0.6)
  });
  page2.drawText('Try drawing shapes, writing notes, adding stamps, or testing the pen tool here.', {
    x: 55,
    y: p2y - 45,
    size: 10,
    font: helveticaOblique,
    color: rgb(0.5, 0.55, 0.6)
  });

  page2.drawText('Page 2 of 2  •  AcrobatFlow PDF Studio', {
    x: 230,
    y: 25,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.55, 0.6)
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
