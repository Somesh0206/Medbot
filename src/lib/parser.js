/**
 * Medical Policy & Document Parser
 * Parses messy, unstructured document text into structured indexed lines, sections, and entity directives.
 */

export function parseDocumentText(rawText, docId = "doc-1") {
  if (!rawText || typeof rawText !== "string") {
    return { lines: [], sections: [], metadata: { totalLines: 0, wordCount: 0 } };
  }

  const rawLines = rawText.split(/\r?\n/);
  const parsedLines = [];
  const sections = [];

  let currentSection = "General Header";
  let wordCount = 0;

  rawLines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    const trimmed = lineText.trim();
    
    // Count words
    if (trimmed.length > 0) {
      wordCount += trimmed.split(/\s+/).length;
    }

    // Header / Section detection
    const sectionMatch = trimmed.match(/^(SECTION|PART|CHAPTER|ARTICLE|LINE \d+: \d+)\s*[\d\w.\-:]*(.*)/i);
    const uppercaseHeader = trimmed.length > 4 && trimmed.length < 80 && trimmed === trimmed.toUpperCase() && !trimmed.endsWith('.');
    
    if (sectionMatch || uppercaseHeader) {
      currentSection = trimmed;
      sections.push({
        lineNumber,
        title: trimmed,
        sectionIndex: sections.length + 1
      });
    }

    // Directives and medical governance entity tagging
    const tags = [];
    if (/\b(MUST|SHALL|MANDATORY|REQUIRED|REQUIREMENT)\b/i.test(trimmed)) {
      tags.push({ type: "mandatory", label: "Mandatory Rule" });
    }
    if (/\b(PROHIBITED|FORBIDDEN|NEVER|STRICTLY PROHIBITED|VIOLATION)\b/i.test(trimmed)) {
      tags.push({ type: "violation", label: "Prohibition" });
    }
    if (/\b(EXEMPTION|EXCEPTION|WAIVER|UNLESS)\b/i.test(trimmed)) {
      tags.push({ type: "exception", label: "Exception / Waiver" });
    }
    if (/\b(PDMP|HIPAA|EHR|IMLC|CPA|CISO|OR|MFA|AES-256)\b/i.test(trimmed)) {
      tags.push({ type: "standard", label: "Regulatory Standard" });
    }

    parsedLines.push({
      lineNumber,
      docId,
      text: lineText,
      section: currentSection,
      tags,
      isEmpty: trimmed.length === 0
    });
  });

  return {
    docId,
    lines: parsedLines,
    sections,
    metadata: {
      totalLines: parsedLines.length,
      wordCount,
      sectionCount: sections.length
    }
  };
}

/**
 * Extracts a line range snippet from parsed lines.
 */
export function getLineRangeExcerpt(parsedDoc, startLine, endLine) {
  if (!parsedDoc || !parsedDoc.lines) return "";
  const filtered = parsedDoc.lines.filter(
    (l) => l.lineNumber >= startLine && l.lineNumber <= endLine
  );
  return filtered.map((l) => l.text).join("\n");
}
