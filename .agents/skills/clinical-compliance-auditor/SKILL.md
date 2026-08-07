---
name: clinical-compliance-auditor
description: Performs statutory clinical compliance audits, multi-format document parsing, grounded evidence Q&A synthesis, and line-citation verification for medical policies and patient records.
---

# Clinical Compliance Auditor Skill

## Skill Overview
The `clinical-compliance-auditor` skill enables AI agents to parse medical documents, audit statutory compliance against State Medical Board standards, extract line-indexed evidence citations, and synthesize grounded Q&A responses.

## When to Activate
Activate this skill whenever the task involves:
1. Auditing medical policies, clinical SOPs, or telehealth guidelines.
2. Reviewing patient clinical records, EHR progress notes, or board hearing transcripts.
3. Generating statutory compliance scores, risk levels, and line citations (`[Line X-Y]`).
4. Answering clinical or governance questions using verbatim evidence from loaded files.

## Instructions & Workflows

### 1. Document Parsing & Line Indexing Workflow
- Convert incoming document text into a 1-indexed line array.
- Identify section headers (e.g. `[Licensure & Compact]`, `[Supervision & Ratios]`, `[Controlled Substances]`, `[Emergency Escalation]`).
- Store metadata including `totalLines`, `wordCount`, and section list.

### 2. Statutory Audit Execution Workflow
- Evaluate indexed lines against standard medical governance rules:
  - **Physician Supervision Limit**: Verify PA ratio caps (max 4 PAs per physician).
  - **PDMP Lookup Mandate**: Ensure mandatory PDMP queries before prescribing Schedule II-IV controlled substances.
  - **Emergency Escalation Protocol**: Confirm presence of 911 dispatch & physical address requirements.
  - **Informed Consent & Language Mandate**: Verify qualified medical interpreter & time-out mandates.
  - **HIPAA & ePHI Encryption**: Check data encryption and breach notification directives.
- Assign status: `VIOLATION`, `ADVISORY`, or `COMPLIANT`.
- Attach verbatim source quotes and line citations `{ startLine, endLine }`.

### 3. Grounded Q&A Evidence Synthesis Workflow
- Tokenize user query terms excluding common stop words.
- Match query terms against indexed document lines and section headers.
- Calculate evidence confidence score (0–100%).
- Synthesize answer strictly from top verbatim matches with exact line citation jump links.

### 4. Dual Registry Storage Workflow
- Store patient clinical notes in `patients_registry.json` (`medbot_patients_registry_v1`).
- Store hospital SOPs & policies in `policies_registry.json` (`medbot_policies_registry_v1`).
