/**
 * Verifiable Executive Summary Engine
 * Generates structured executive summaries for selected documents where every assertion is backed by a line-indexed citation pill.
 */

export function generateVerifiableSummary(parsedDoc, auditResults = []) {
  if (!parsedDoc || !parsedDoc.lines || parsedDoc.lines.length === 0) {
    return { 
      overview: "No document selected or loaded.", 
      stats: { totalLines: 0, wordCount: 0, violations: 0, advisories: 0, complianceScore: 100, riskLevel: "UNKNOWN" },
      takeaways: [], 
      riskAnalysis: [] 
    };
  }

  const docTitle = parsedDoc.metadata?.title || parsedDoc.docId || "Selected Document";
  const totalLines = parsedDoc.metadata?.totalLines || parsedDoc.lines.length;
  const wordCount = parsedDoc.metadata?.wordCount || parsedDoc.lines.reduce((acc, l) => acc + l.text.split(/\s+/).length, 0);
  
  // Calculate compliance statistics (case-insensitive)
  const totalAudits = auditResults.length;
  const violations = auditResults.filter((r) => (r.status || '').toUpperCase() === "VIOLATION").length;
  const advisories = auditResults.filter((r) => (r.status || '').toUpperCase() === "ADVISORY").length;
  const compliant = auditResults.filter((r) => (r.status || '').toUpperCase() === "COMPLIANT").length;

  const rawScore = 100 - (violations * 25 + advisories * 10);
  const complianceScore = Math.max(0, Math.min(100, rawScore));

  const riskLevel = violations > 0 ? "HIGH RISK (Statutory Violations)" : advisories > 0 ? "MODERATE RISK (Advisories Issued)" : "LOW RISK (Fully Compliant)";

  // Extract key takeaways tied to line citations from the selected document
  const takeaways = [];
  const addedLines = new Set();

  // First pass: extract key sentences/directives from document lines
  parsedDoc.lines.forEach((line) => {
    const text = line.text.trim();
    if (text.length < 25 || addedLines.has(line.lineNumber)) return;

    const lower = text.toLowerCase();
    
    // Check for high-value compliance/clinical keywords
    const isHighValue = /licensure|imlc|jurisdiction|supervis|ratio|four|pa\b|pdmp|narcotic|schedule|emergency|dispatch|anaphylaxis|consent|interpreter|time-out|hipaa|encryption|patient|record|dose|medication|history|diagnosis|treatment|policy|procedure|shall|must|required/i.test(lower);

    if (isHighValue && takeaways.length < 8) {
      takeaways.push({
        topic: line.section || "Key Provision",
        text: text,
        citation: { startLine: line.lineNumber, endLine: line.lineNumber }
      });
      addedLines.add(line.lineNumber);
    }
  });

  // Fallback pass if takeaways are few: sample lines across document sections
  if (takeaways.length < 3) {
    const step = Math.max(1, Math.floor(parsedDoc.lines.length / 5));
    for (let i = 0; i < parsedDoc.lines.length; i += step) {
      const line = parsedDoc.lines[i];
      if (line && line.text.trim().length > 20 && !addedLines.has(line.lineNumber) && takeaways.length < 6) {
        takeaways.push({
          topic: line.section || `Section ${i + 1}`,
          text: line.text.trim(),
          citation: { startLine: line.lineNumber, endLine: line.lineNumber }
        });
        addedLines.add(line.lineNumber);
      }
    }
  }

  // Section breakdown
  const sectionsList = (parsedDoc.sections || []).map(s => typeof s === 'string' ? s : (s.name || s.title || 'General')).filter(Boolean);

  const overview = `Executive Summary for selected document "${docTitle}" comprising ${totalLines} indexed lines (${wordCount} total words${sectionsList.length > 0 ? `, spanning ${sectionsList.length} defined sections: ${sectionsList.slice(0, 3).join(', ')}` : ''}). Evaluated for clinical governance & regulatory compliance. Overall Status: ${riskLevel} (${complianceScore}% Compliance Score).`;

  return {
    docTitle,
    overview,
    stats: {
      totalLines,
      wordCount,
      totalAudits,
      violations,
      advisories,
      compliant,
      complianceScore,
      riskLevel
    },
    takeaways,
    sectionsList,
    riskAnalysis: auditResults.map((audit) => ({
      title: audit.title,
      status: audit.status,
      findings: audit.findings,
      citation: audit.citation
    }))
  };
}
