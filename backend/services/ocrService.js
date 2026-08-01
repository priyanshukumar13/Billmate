const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

async function extractText(fileBuffer, mimeType) {
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdfParse(fileBuffer);
      return data.text;
    } catch (err) {
      console.error('PDF Parse Error:', err);
      throw new Error('Failed to parse PDF receipt file.');
    }
  } else {
    // Treat as image
    try {
      const { data: { text } } = await Tesseract.recognize(
        fileBuffer,
        'eng',
        { logger: m => console.log('Tesseract OCR:', m.status) }
      );
      return text;
    } catch (err) {
      console.error('Tesseract OCR Error:', err);
      throw new Error('OCR text extraction from image failed.');
    }
  }
}

module.exports = {
  extractText
};
