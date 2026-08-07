# 🤖 Custom Agents & Custom Skills Documentation

This document describes the custom AI agents and specialized agent skills implemented in the **Healio Clinical AI Platform**.

---

## 1. Custom Agent: `clinical-audit-agent`

- **File Path**: [.agents/clinical-audit-agent/AGENT.md](file:///.agents/clinical-audit-agent/AGENT.md)
- **Role**: Clinical Compliance Audit Subagent
- **Description**: An autonomous subagent designed to analyze medical documents, medical board hearing transcripts, and hospital SOPs against statutory regulations, Physician Assistant supervision limits, PDMP lookup mandates, surgical consent rules, and HIPAA directives.

### Key Capabilities
- Multi-format document text extraction (PDF, DOCX, TXT, MD, CSV, JSON, HTML).
- Automated statutory audit matrix generation with status classification (`VIOLATION`, `ADVISORY`, `COMPLIANT`).
- 100% Verbatim line-range citation generation (`[Line X-Y]`).
- Dual-file document storage management (`patients_registry.json` & `policies_registry.json`).

---

## 2. Custom Skill: `clinical-compliance-auditor`

- **File Path**: [.agents/skills/clinical-compliance-auditor/SKILL.md](file:///.agents/skills/clinical-compliance-auditor/SKILL.md)
- **Skill Name**: `clinical-compliance-auditor`
- **Trigger Conditions**: Triggers on clinical audit requests, medical document parsing, hospital SOP compliance reviews, grounded Q&A queries, or line citation verifications.

### Workflow Pipeline
1. **Parsing & Line Indexing**: Converts raw files into 1-indexed line arrays with section header detection.
2. **Statutory Rule Evaluation**: Scans lines against governance rules (PA ratio caps, mandatory PDMP checks, emergency escalation protocols, qualified interpreter mandates, HIPAA encryption).
3. **Grounded Q&A Verification**: Tokenizes query terms, extracts top verbatim line matches, calculates confidence scores (0–100%), and builds chain-of-thought evidence reasoning.
4. **Dual Registry Management**: Routes patient records to `patients` registry file and SOPs to `policies` registry file.
