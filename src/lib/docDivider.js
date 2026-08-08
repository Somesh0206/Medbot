/**
 * Document Separation Engine for Healio Clinical AI Platform
 * Automatically parses, classifies, and splits multi-domain documents
 * into standalone Patient Record and Hospital Policy documents.
 */

/**
 * Evaluates whether a line or section text leans towards Patient Record vs Hospital Policy.
 * @param {string} text 
 * @returns {'patient' | 'policy' | 'neutral'}
 */
export function classifyTextDomain(text) {
  if (!text || typeof text !== 'string') return 'neutral';
  const lower = text.toLowerCase();

  const patientKeywords = [
    'patient name', 'patient id', 'dob:', 'date of birth', 'mrn:', 'vital signs',
    'chief complaint', 'history of present illness', 'past medical history', 'clinical note',
    'physical exam', 'diagnosis:', 'assessment & plan', 'progress note', 'lab results',
    'symptoms', 'prescribed', 'encounter date', 'hearing transcript', 'transcript line',
    'doctor:', 'physician note', 'patient record', 'blood pressure', 'heart rate', 'spo2'
  ];

  const policyKeywords = [
    'supervision ratio', 'pdmp lookup', 'controlled substances', 'emergency escalation',
    'informed consent', 'hipaa', 'ephi', 'compliance directive', 'hospital policy',
    'standard operating procedure', 'sop', 'statutory mandate', 'governance rule',
    'prohibited', 'strictly prohibited', 'physician supervision', 'pa ratio', 'np ratio',
    'aes-256', 'breach notification', 'ciso', 'board policy', 'section 1', 'section 2'
  ];

  let patientScore = 0;
  let policyScore = 0;

  patientKeywords.forEach((kw) => {
    if (lower.includes(kw)) patientScore += 2;
  });

  policyKeywords.forEach((kw) => {
    if (lower.includes(kw)) policyScore += 2;
  });

  // Additional regex signals
  if (/\b(patient|patient's|vitals|dob|mrn|diagnosis|rx|medication|dosage)\b/i.test(lower)) patientScore += 1;
  if (/\b(shall|must|mandatory|policy|protocol|ratio|pdmp|hipaa|statutory|governance)\b/i.test(lower)) policyScore += 1;

  if (patientScore > policyScore && patientScore >= 2) return 'patient';
  if (policyScore > patientScore && policyScore >= 2) return 'policy';
  return 'neutral';
}

/**
 * Splits raw document text into Patient Record content and Hospital Policy content.
 * @param {string} rawText 
 * @param {string} baseTitle 
 * @returns {{
 *   containsDual: boolean,
 *   patientContent: string,
 *   policyContent: string,
 *   patientTitle: string,
 *   policyTitle: string,
 *   summaryStats: { totalLines: number, patientLinesCount: number, policyLinesCount: number }
 * }}
 */
export function splitDualDocument(rawText, baseTitle = "Medical Document") {
  if (!rawText || typeof rawText !== "string") {
    return {
      containsDual: false,
      patientContent: "",
      policyContent: rawText || "",
      patientTitle: `${baseTitle} (Patient Record)`,
      policyTitle: `${baseTitle} (Hospital Policy)`,
      summaryStats: { totalLines: 0, patientLinesCount: 0, policyLinesCount: 0 }
    };
  }

  const lines = rawText.split(/\r?\n/);
  const patientLines = [];
  const policyLines = [];

  let currentDomain = 'neutral';
  let hasPatientDomain = false;
  let hasPolicyDomain = false;

  lines.forEach((lineText) => {
    const domain = classifyTextDomain(lineText);
    if (domain !== 'neutral') {
      currentDomain = domain;
    }

    if (domain === 'patient') hasPatientDomain = true;
    if (domain === 'policy') hasPolicyDomain = true;

    // Distribute lines based on domain classification or context
    if (currentDomain === 'patient') {
      patientLines.push(lineText);
    } else if (currentDomain === 'policy') {
      policyLines.push(lineText);
    } else {
      // Neutral lines placed in both or policy fallback if no dual active yet
      if (hasPatientDomain && !hasPolicyDomain) {
        patientLines.push(lineText);
      } else if (hasPolicyDomain && !hasPatientDomain) {
        policyLines.push(lineText);
      } else {
        patientLines.push(lineText);
        policyLines.push(lineText);
      }
    }
  });

  const containsDual = hasPatientDomain && hasPolicyDomain;

  // Clean up content strings
  const patientContent = patientLines.join("\n").trim();
  const policyContent = policyLines.join("\n").trim();

  const cleanBaseTitle = baseTitle.replace(/\s*\((Patient Record|Hospital Policy|Dual Content)\)/i, '').trim();

  return {
    containsDual,
    patientContent: patientContent || rawText,
    policyContent: policyContent || rawText,
    patientTitle: `${cleanBaseTitle} — Patient Record Details`,
    policyTitle: `${cleanBaseTitle} — Hospital Governance Policy`,
    summaryStats: {
      totalLines: lines.length,
      patientLinesCount: patientLines.length,
      policyLinesCount: policyLines.length
    }
  };
}
