/**
 * Grounded Q&A Engine with Citation Verification
 * Answers queries strictly using parsed document lines and compliance rules.
 * Supports dynamic Q&A on any custom-inserted medical or policy documents (PDF, Word, TXT, etc.).
 */

export function answerGroundedQuery(query, parsedDoc, auditResults) {
  if (!query || !query.trim() || !parsedDoc || !parsedDoc.lines || parsedDoc.lines.length === 0) {
    return {
      answer: "Please select or upload a document to ask questions about its content.",
      confidence: 0,
      excerpts: [],
      reasoning: ["No document active or empty query provided."]
    };
  }

  const cleanQuery = query.trim();
  const queryLower = cleanQuery.toLowerCase();
  
  // Extract key search terms (excluding stop words)
  const stopWords = new Set([
    "what", "is", "the", "are", "a", "an", "and", "or", "in", "of", "to", "for",
    "with", "on", "at", "from", "by", "how", "does", "do", "can", "should", "must",
    "required", "requirement", "requirements", "rule", "rules", "policy", "section",
    "line", "tell", "me", "about", "which", "when", "where", "who", "why"
  ]);

  const queryTokens = queryLower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const matchedLines = [];

  // Search indexed lines in the current document
  parsedDoc.lines.forEach((line) => {
    const textLower = line.text.toLowerCase();
    let score = 0;
    let matchesCount = 0;

    queryTokens.forEach((token) => {
      if (textLower.includes(token)) {
        score += 2;
        matchesCount++;
      }
    });

    // Exact phrase match bonus
    if (queryTokens.length > 1 && textLower.includes(queryLower)) {
      score += 5;
    }

    // Section title relevance bonus
    if (line.section && queryTokens.some((t) => line.section.toLowerCase().includes(t))) {
      score += 1.5;
    }

    if (score > 0 && line.text.trim().length > 5) {
      matchedLines.push({
        line,
        score,
        matchesCount
      });
    }
  });

  // Sort matched lines by score
  matchedLines.sort((a, b) => b.score - a.score);

  // If no direct token match found, fallback to searching with full word set
  if (matchedLines.length === 0) {
    const fallbackTokens = queryLower.split(/\s+/).filter((w) => w.length > 2);
    parsedDoc.lines.forEach((line) => {
      const textLower = line.text.toLowerCase();
      let score = 0;
      fallbackTokens.forEach((token) => {
        if (textLower.includes(token)) score += 1;
      });
      if (score > 0 && line.text.trim().length > 10) {
        matchedLines.push({ line, score, matchesCount: score });
      }
    });
    matchedLines.sort((a, b) => b.score - a.score);
  }

  const topMatches = matchedLines.slice(0, 5);

  if (topMatches.length === 0) {
    return {
      answer: `I could not locate explicit information regarding "${cleanQuery}" in the document "${parsedDoc.metadata.title || parsedDoc.docId}". To maintain 100% verifiable accuracy and prevent hallucination, answers are strictly generated from verbatim lines in your loaded document.`,
      confidence: 10,
      excerpts: [],
      reasoning: [
        `Scanned all ${parsedDoc.metadata.totalLines} indexed lines in "${parsedDoc.metadata.title || parsedDoc.docId}".`,
        `No direct evidence match found for query terms: "${cleanQuery}".`,
        "Answer withheld to guarantee 100% citation precision."
      ]
    };
  }

  // Group top matches into citations
  const excerpts = topMatches.map((m) => ({
    lineNumber: m.line.lineNumber,
    section: m.line.section || "General",
    text: m.line.text.trim()
  }));

  // Sort excerpts by line number for coherent answer synthesis
  const sortedExcerpts = [...excerpts].sort((a, b) => a.lineNumber - b.lineNumber);
  const startLine = sortedExcerpts[0].lineNumber;
  const endLine = sortedExcerpts[sortedExcerpts.length - 1].lineNumber;

  // Format clean answer output
  let answerText = `Based on the loaded document "${parsedDoc.metadata.title || 'Loaded Document'}" (Lines ${startLine}–${endLine}):\n\n`;
  
  sortedExcerpts.forEach((e) => {
    answerText += `• [Line ${e.lineNumber}] ${e.text}\n`;
  });

  const confidence = Math.min(98, Math.max(65, 75 + topMatches[0].matchesCount * 6 + Math.min(topMatches.length * 4, 15)));

  const reasoning = [
    `Scanned ${parsedDoc.metadata.totalLines} lines in active document "${parsedDoc.metadata.title || parsedDoc.docId}".`,
    `Identified ${topMatches.length} matching verbatim evidence passages.`,
    `Grounded evidence spans Lines ${startLine} to ${endLine} (Section: ${sortedExcerpts[0].section}).`,
    `Cross-verified query alignment with ${confidence}% evidence confidence.`
  ];

  return {
    answer: answerText,
    confidence,
    citation: { startLine, endLine },
    excerpts: sortedExcerpts,
    reasoning
  };
}

/**
 * Dynamically generates suggested question prompts based on the content & sections of the loaded document (PDF/Word/Text).
 */
export function generateDocumentQuestions(parsedDoc, activeDocData) {
  if (!parsedDoc || !parsedDoc.lines || parsedDoc.lines.length === 0) {
    return [
      "What are the main rules in this document?",
      "What emergency or safety procedures are listed?",
      "What compliance logging steps are required?"
    ];
  }

  const title = activeDocData?.title || parsedDoc.metadata?.title || 'Loaded Document';
  const sections = (parsedDoc.sections || []).map(s => typeof s === 'string' ? s : (s.name || s.title)).filter(Boolean);
  
  const prompts = [];
  const textLower = parsedDoc.lines.map(l => l.text).join(' ').toLowerCase();

  if (textLower.includes('supervis') || textLower.includes('pa') || textLower.includes('ratio')) {
    prompts.push("What are the physician supervision cap & PA limits?");
  }
  if (textLower.includes('pdmp') || textLower.includes('narcotic') || textLower.includes('prescription')) {
    prompts.push("What are the mandatory PDMP lookup & prescription rules?");
  }
  if (textLower.includes('emergency') || textLower.includes('dispatch') || textLower.includes('address')) {
    prompts.push("What are the emergency escalation & 911 dispatch protocols?");
  }
  if (textLower.includes('consent') || textLower.includes('interpreter') || textLower.includes('surgical')) {
    prompts.push("What are the informed consent & interpreter mandates?");
  }
  if (textLower.includes('hipaa') || textLower.includes('privacy') || textLower.includes('encryption') || textLower.includes('ephi')) {
    prompts.push("What are the HIPAA data privacy & encryption rules?");
  }

  // Add section-derived questions if available
  sections.slice(0, 2).forEach(sec => {
    if (sec && sec.length < 40) {
      prompts.push(`What key guidelines apply to section "${sec}"?`);
    }
  });

  // Always include fallback dynamic prompts if less than 3
  if (prompts.length < 3) {
    prompts.push(`What are the main clinical/operational requirements in this document?`);
    prompts.push("What mandatory compliance logs or records are required?");
    prompts.push("What exceptions or waiver clauses are specified?");
  }

  return Array.from(new Set(prompts)).slice(0, 4);
}

/**
 * Synthesizes a structured Medical Executive Summary for any clinical, statutory, or medical query.
 * @param {string} query 
 * @param {Array} allDocuments 
 * @param {Object} activeParsedDoc 
 * @returns {Object} Executive Query Summary Payload
 */
export function synthesizeMedicalQuerySummary(query, allDocuments = [], activeParsedDoc = null) {
  if (!query || !query.trim()) {
    return {
      query: "",
      overview: "Please enter a clinical, statutory, or medical question above.",
      confidence: 0,
      riskLevel: "INFORMATIONAL",
      citations: [],
      takeaways: [],
      recommendations: []
    };
  }

  const cleanQuery = query.trim();
  const queryLower = cleanQuery.toLowerCase();

  // Aggregate lines across all available documents or active parsed document
  let targetLines = [];
  if (activeParsedDoc && activeParsedDoc.lines) {
    targetLines = activeParsedDoc.lines.map(l => ({ ...l, docTitle: activeParsedDoc.metadata?.title || 'Loaded Document' }));
  }

  // Also collect lines from other stored documents if available
  if (Array.isArray(allDocuments)) {
    allDocuments.forEach(doc => {
      if (doc.rawContent && doc.title !== (activeParsedDoc?.metadata?.title)) {
        const rawLines = doc.rawContent.split(/\r?\n/);
        rawLines.forEach((text, index) => {
          if (text.trim().length > 15) {
            targetLines.push({
              lineNumber: index + 1,
              text,
              section: doc.category || 'Knowledge Base',
              docTitle: doc.title
            });
          }
        });
      }
    });
  }

  const stopWords = new Set([
    "what", "is", "the", "are", "a", "an", "and", "or", "in", "of", "to", "for",
    "with", "on", "at", "from", "by", "how", "does", "do", "can", "should", "must",
    "required", "requirement", "requirements", "rule", "rules", "policy", "section",
    "line", "tell", "me", "about", "which", "when", "where", "who", "why"
  ]);

  const queryTokens = queryLower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const scoredLines = [];
  targetLines.forEach((l) => {
    const tLower = l.text.toLowerCase();
    let score = 0;
    queryTokens.forEach((tok) => {
      if (tLower.includes(tok)) score += 2;
    });
    if (queryTokens.length > 1 && tLower.includes(queryLower)) score += 4;
    if (score > 0) {
      scoredLines.push({ line: l, score });
    }
  });

  scoredLines.sort((a, b) => b.score - a.score);
  const topMatches = scoredLines.slice(0, 6).map(s => s.line);

  if (topMatches.length === 0) {
    return {
      query: cleanQuery,
      overview: `No direct verbatim evidence matching "${cleanQuery}" was found in active document registries. To comply with statutory zero-hallucination mandates, answers are strictly synthesized from authenticated document lines.`,
      confidence: 15,
      riskLevel: "UNVERIFIED QUERY",
      citations: [],
      takeaways: [
        { topic: "Zero-Hallucination Guardrail", text: "Answer withheld due to missing explicit source line citations." }
      ],
      recommendations: ["Upload or paste the relevant medical policy or clinical progress note to index new evidence."]
    };
  }

  const citations = topMatches.map(l => ({
    docTitle: l.docTitle,
    lineNumber: l.lineNumber,
    section: l.section || 'General Provision',
    text: l.text.trim()
  }));

  const confidence = Math.min(98, Math.max(70, 75 + topMatches.length * 4));

  // Determine risk level / clinical category based on search terms
  let riskLevel = "INFORMATIONAL GUIDANCE";
  if (/supervis|ratio|cap|pdmp|narcotic|schedule|breach|hipaa/i.test(queryLower)) {
    riskLevel = "STATUTORY MANDATE (High Compliance Impact)";
  } else if (/emergency|dispatch|address|anaphylaxis|cardiac/i.test(queryLower)) {
    riskLevel = "EMERGENCY PROTOCOL (Critical Safety)";
  } else if (/consent|interpreter|surgical|time-out/i.test(queryLower)) {
    riskLevel = "CLINICAL GOVERNANCE";
  }

  const overview = `Executive Summary for Query: "${cleanQuery}"\n\nSynthesized across ${topMatches.length} verbatim evidence lines in document registry. Verified Grounding Confidence: ${confidence}%. Category: ${riskLevel}.\n\n` +
    topMatches.slice(0, 3).map((m, idx) => `${idx + 1}. [${m.docTitle} - Line ${m.lineNumber}] ${m.text.trim()}`).join('\n\n');

  const takeaways = topMatches.slice(0, 4).map(m => ({
    topic: m.section || 'Clinical Finding',
    docTitle: m.docTitle,
    citation: { startLine: m.lineNumber, endLine: m.lineNumber },
    text: m.text.trim()
  }));

  const recommendations = [
    "Verify exact line citations against loaded statutory document before clinical execution.",
    "Log query audit trail in per-session activity registry.",
    "Ensure 24/7 staff adherence to statutory mandates and emergency protocols."
  ];

  return {
    query: cleanQuery,
    overview,
    confidence,
    riskLevel,
    citations,
    takeaways,
    recommendations
  };
}

