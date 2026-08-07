/**
 * Verifiable Executive Summary Engine
 * Generates structured executive summaries where every assertion is backed by a line-indexed citation pill.
 */

export function generateVerifiableSummary(parsedDoc, auditResults) {
  if (!parsedDoc || !parsedDoc.lines) {
    return { overview: "", keyTakeaways: [], riskAnalysis: [] };
  }

  const totalLines = parsedDoc.metadata.totalLines;
  const wordCount = parsedDoc.metadata.wordCount;
  
  // Calculate compliance statistics
  const totalAudits = auditResults.length;
  const violations = auditResults.filter((r) => r.status === "violation").length;
  const advisories = auditResults.filter((r) => r.status === "advisory").length;
  const compliant = auditResults.filter((r) => r.status === "compliant").length;

  const riskLevel = violations > 0 ? "HIGH RISK (Statutory Violations)" : advisories > 0 ? "MODERATE RISK (Advisories Found)" : "LOW RISK (Compliant)";

  // Generate key takeaways tied to line citations
  const keyTakeaways = [];

  // Inspect lines for key medical directives
  parsedDoc.lines.forEach((line) => {
    const text = line.text.trim();
    
    if (/licensure|imlc|jurisdiction/i.test(text) && text.length > 30 && keyTakeaways.length < 2) {
      keyTakeaways.push({
        topic: "Licensure & Interstate Compact",
        text: text,
        citation: { startLine: line.lineNumber, endLine: line.lineNumber }
      });
    }
    
    if (/supervis|ratio|four|pa\b/i.test(text) && text.length > 30 && keyTakeaways.length < 4) {
      keyTakeaways.push({
        topic: "Provider Supervision",
        text: text,
        citation: { startLine: line.lineNumber, endLine: line.lineNumber }
      });
    }

    if (/pdmp|narcotic|schedule/i.test(text) && text.length > 30 && keyTakeaways.length < 6) {
      keyTakeaways.push({
        topic: "Controlled Substance Security",
        text: text,
        citation: { startLine: line.lineNumber, endLine: line.lineNumber }
      });
    }

    if (/emergency|dispatch|address|anaphylaxis/i.test(text) && text.length > 30 && keyTakeaways.length < 8) {
      keyTakeaways.push({
        topic: "Emergency Escalation",
        text: text,
        citation: { startLine: line.lineNumber, endLine: line.lineNumber }
      });
    }

    if (/consent|interpreter|time-out|hipaa|encryption/i.test(text) && text.length > 30 && keyTakeaways.length < 10) {
      keyTakeaways.push({
        topic: "Patient Safety & Governance",
        text: text,
        citation: { startLine: line.lineNumber, endLine: line.lineNumber }
      });
    }
  });

  // Risk & Compliance analysis summary
  const riskAnalysis = auditResults.map((audit) => ({
    title: audit.title,
    status: audit.status,
    findings: audit.findings,
    citation: audit.citation
  }));

  return {
    overview: `Document containing ${totalLines} parsed lines (${wordCount} words). Evaluated against State Medical Board Regulations & Clinical Governance Standards. Overall Risk Assessment: ${riskLevel}.`,
    stats: {
      totalLines,
      wordCount,
      totalAudits,
      violations,
      advisories,
      compliant,
      riskLevel
    },
    keyTakeaways,
    riskAnalysis
  };
}
