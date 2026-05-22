const fs = require('fs');
const pdf = require('pdf-parse');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function test() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  page.drawText('Hello World! This is a test PDF.', { x: 50, y: 700 });
  const pdfBytes = await pdfDoc.save();
  
  const buffer = Buffer.from(pdfBytes);
  
  try {
    const result = await pdf(buffer);
    console.log("Extracted text:", result.text);
  } catch(err) {
    console.error("PDF parse error:", err);
  }
}
test();
