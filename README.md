# 🏥 Healio — Verifiable Clinical Intelligence & Medical Governance Studio

[![Healio CI Pipeline](https://github.com/Somesh0206/Medbot/actions/workflows/ci.yml/badge.svg)](https://github.com/Somesh0206/Medbot/actions/workflows/ci.yml)
[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat&logo=vercel)](https://medbot-studio.vercel.app)

**Healio** is a next-generation verifiable clinical intelligence and medical governance platform built for medical boards, hospital administrators, healthcare providers, and clinical auditors. It parses multi-format medical records and hospital policies (PDF, Word DOCX/DOC, Text, RTF, CSV, JSON, HTML) into line-indexed statutory audit matrices, grounded evidence Q&A engines, and dual-file document registries with 100% verifiable source line citations.

---

## 🌐 Live Production Links
- **Vercel Production Application**: [https://medbot-studio.vercel.app](https://medbot-studio.vercel.app)
- **GitHub Repository**: [https://github.com/Somesh0206/Medbot](https://github.com/Somesh0206/Medbot)

---

## ✅ Five Entry Checkpoints Verification

| Checkpoint | Status | Description & Location |
| :--- | :---: | :--- |
| **1. Architecture Document** | 🟢 PASS | Full stack, data model, and architecture diagrams documented in [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| **2. Agent Rules & Constitution** | 🟢 PASS | AI agent rules & system governance mandates defined in [`AGENTS.md`](AGENTS.md), [`.clinerules`](.clinerules), and [`constitution.md`](constitution.md) |
| **3. Working Code** | 🟢 PASS | Next.js 16 production application compiles cleanly via `npm run build` & deployed live on Vercel |
| **4. Custom Agent & Custom Skill** | 🟢 PASS | Custom agent `clinical-audit-agent` and skill `clinical-compliance-auditor` committed & documented in [`AGENTS_AND_SKILLS.md`](AGENTS_AND_SKILLS.md) |
| **5. Green CI/CD Pipeline** | 🟢 PASS | GitHub Actions CI workflow implemented in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

---

## 🚀 Key Features

1. **Mandatory User Identity Access**: First-time visitor identification modal linked to persistent user activity audit trails.
2. **5 Clean Navigation Workspaces**:
   - 🏠 **Home Overview**: Healio hero banner, document status, and core function cards.
   - 📜 **Indexed Document Reader**: Full-focus reader with line number badges (`#1`) and section tags.
   - 🛡️ **Statutory Audit Matrix**: Real-time compliance checking against State Medical Board rules, PA ratios, and HIPAA mandates with jumpable line citations.
   - 📊 **Executive Summary**: Comprehensive risk score, violations, advisories, and verifiable takeaways.
   - 💬 **Grounded Evidence Q&A**: Grounded question answering with verbatim source excerpts and chain-of-thought evidence reasoning.
3. **Dual-File Document Storage Engine**: Partitioned into `patients_registry.json` (Patient Records) and `policies_registry.json` (Hospital SOPs).

---

## 🛠️ Local Development & Build

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Verify production build
npm run build
```
