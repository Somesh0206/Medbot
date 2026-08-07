# Healio Platform Constitution

This document defines the core principles, governing rules, and verification mandates for the Healio Clinical AI Platform.

## Core Mandates

### 1. Evidence Verifiability
Every statutory compliance finding, executive summary takeaway, and Q&A response emitted by Healio must include direct line citations (`[Line X-Y]`) referencing verbatim lines in the loaded document.

### 2. Dual-File Registry Categorization
Document storage is strictly partitioned into two dedicated registry files:
- **Patient Records File**: EHRs, clinical notes, case hearing transcripts (`patients_registry.json`).
- **Hospital Policies File**: Clinical SOPs, telemedicine rules, surgical governance, HIPAA protocols (`policies_registry.json`).

### 3. User Identity Auditability
All user interactions (document insertions, audits, queries, and deletions) are attributed to the active user's identity and stored in the User Session Audit Trail.

### 4. Build & CI Integrity
No code shall be merged into production unless `npm run build` passes 100% cleanly and the GitHub Actions CI pipeline is green.
