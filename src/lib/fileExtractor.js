/**
 * Multi-Format Document File Extractor
 * Supports parsing PDF (.pdf), Word (.docx, .doc), Rich Text (.rtf), Plain Text (.txt), Markdown (.md), JSON (.json), CSV (.csv), HTML (.html).
 */

import * as mammoth from 'mammoth';

/**
 * Parses any uploaded File object and returns extracted raw text.
 * @param {File} file 
 * @returns {Promise<string>}
 */
export async function extractTextFromFile(file) {
  if (!file) return '';

  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  // 1. Word Documents (.docx)
  if (fileName.endsWith('.docx') || fileType.includes('vnd.openxmlformats-officedocument.wordprocessingml.document')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result.value && result.value.trim()) {
        return result.value.trim();
      }
    } catch (err) {
      console.warn('Mammoth docx extraction warning, falling back to stream reader:', err);
    }
  }

  // 2. PDF Documents (.pdf)
  if (fileName.endsWith('.pdf') || fileType.includes('pdf')) {
    try {
      const text = await extractPdfText(file);
      if (text && text.trim().length > 10) {
        return text.trim();
      }
    } catch (err) {
      console.warn('PDF parsing warning, attempting text stream fallback:', err);
    }
  }

  // 3. Binary Fallback for legacy .doc / .rtf
  if (fileName.endsWith('.doc') || fileName.endsWith('.rtf')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const text = extractCleanTextFromBinary(arrayBuffer);
      if (text && text.trim().length > 10) {
        return text.trim();
      }
    } catch (err) {
      console.warn('Legacy binary text extraction error:', err);
    }
  }

  // 4. Plain Text, Markdown, JSON, CSV, HTML, Code files
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let content = e.target.result || '';
      // Strip HTML tags if HTML document
      if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
        content = content.replace(/<[^>]*>/g, ' ');
      }
      resolve(content.trim());
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}

/**
 * Client-Side PDF Text Extractor using PDF.js or ArrayBuffer Stream Parsing
 */
async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();

  try {
    const pdfjsLib = await import('pdfjs-dist');
    // Configure worker
    if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
    }

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items.map((item) => item.str);
      const pageText = pageStrings.join(' ');
      fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
    }

    if (fullText.trim().length > 20) {
      return fullText;
    }
  } catch (err) {
    console.warn('PDF.js dynamic import error, using Uint8 stream fallback:', err);
  }

  // Fallback binary text extractor for PDF streams
  return extractCleanTextFromBinary(arrayBuffer);
}

/**
 * Extracts printable ASCII/UTF-8 strings from binary buffers (for legacy .pdf / .doc)
 */
function extractCleanTextFromBinary(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let result = '';
  let currentChunk = '';

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    // Printable ASCII chars + newlines & tabs
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
      currentChunk += String.fromCharCode(byte);
    } else {
      if (currentChunk.length >= 4) {
        result += currentChunk + ' ';
      }
      currentChunk = '';
    }
  }
  if (currentChunk.length >= 4) {
    result += currentChunk;
  }

  // Clean up non-printable control sequences & garbage
  return result
    .replace(/\s+/g, ' ')
    .replace(/(obj|endobj|stream|endstream|xref|trailer|startxref)/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 10)
    .join('\n');
}
