<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Healio Clinical AI Platform Agent Constitution & Rules

## 1. Statutory Compliance & Evidence Grounding Rules
- **Rule 1 (Verbatim Grounding)**: All audit matrix findings and Q&A responses MUST be backed by verbatim line numbers `[Line X-Y]` from the active loaded document.
- **Rule 2 (Zero Hallucination)**: If evidence is missing from the active document, explicit warnings must be emitted and confidence scores reduced.
- **Rule 3 (Dual Registry Integrity)**: Document insertions MUST be categorized into either the **Patient Records File** (`patients_registry.json`) or **Hospital Policies File** (`policies_registry.json`).

## 2. Code Quality & Build Standards
- **Rule 4 (Build Verification)**: All code changes must compile 100% cleanly using `npm run build` prior to deployment.
- **Rule 5 (SSR Safety)**: Browser storage (`localStorage`, `window`) MUST be guarded with `typeof window !== 'undefined'` to prevent SSR prerender failures.
- **Rule 6 (UI Excellence)**: Use modern cyber-medical aesthetics (Outfit & Inter fonts, CSS design tokens, glassmorphism, responsive navigation).
