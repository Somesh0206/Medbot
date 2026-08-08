/**
 * Main Application Controller for VeriMed AI Agent
 * Orchestrates document parsing, audit execution, persistent document registry, citation highlighting, Q&A, and export.
 */

import { SAMPLE_DOCUMENTS } from './sampleData.js';
import { parseDocumentText } from './parser.js';
import { runComplianceAudit } from './auditEngine.js';
import { generateVerifiableSummary } from './summaryEngine.js';
import { answerGroundedQuery } from './qaEngine.js';
import { exportToMarkdown, exportToJSON, downloadFile } from './exportUtils.js';
import {
  getStoredDocuments,
  saveDocumentToRegistry,
  deleteDocumentFromRegistry,
  exportRegistryJSON,
  importRegistryJSON
} from './storageEngine.js';

// Application State
let activeDocData = null;
let parsedDoc = null;
let auditResults = [];
let summaryData = null;
let activeHighlightLine = null;

// DOM Elements
const docSelect = document.getElementById('docSelect');
const activeDocTitle = document.getElementById('activeDocTitle');
const activeDocMeta = document.getElementById('activeDocMeta');
const lineCountTag = document.getElementById('lineCountTag');
const docLinesContainer = document.getElementById('docLinesContainer');
const docSearchInput = document.getElementById('docSearchInput');

const statRisk = document.getElementById('statRisk');
const statCompliant = document.getElementById('statCompliant');
const statAdvisory = document.getElementById('statAdvisory');
const statViolation = document.getElementById('statViolation');
const auditGridContainer = document.getElementById('auditGridContainer');

const summaryOverviewText = document.getElementById('summaryOverviewText');
const summaryTakeawaysContainer = document.getElementById('summaryTakeawaysContainer');

const schemaJSONView = document.getElementById('schemaJSONView');
const btnCopySchemaJSON = document.getElementById('btnCopySchemaJSON');

const qaInput = document.getElementById('qaInput');
const btnAskQA = document.getElementById('btnAskQA');
const qaResponseContainer = document.getElementById('qaResponseContainer');
const suggestedPromptsContainer = document.getElementById('suggestedPromptsContainer');

const btnQuickDemo = document.getElementById('btnQuickDemo');
const btnExport = document.getElementById('btnExport');
const exportModal = document.getElementById('exportModal');
const btnCloseExportModal = document.getElementById('btnCloseExportModal');
const exportPreviewCode = document.getElementById('exportPreviewCode');
const btnDownloadMarkdown = document.getElementById('btnDownloadMarkdown');
const btnDownloadJSON = document.getElementById('btnDownloadJSON');

const btnUploadModal = document.getElementById('btnUploadModal');
const uploadModal = document.getElementById('uploadModal');
const btnCloseUploadModal = document.getElementById('btnCloseUploadModal');
const btnIngestCustomDoc = document.getElementById('btnIngestCustomDoc');
const customDocTitleInput = document.getElementById('customDocTitleInput');
const customDocCategorySelect = document.getElementById('customDocCategorySelect');
const customDocTextInput = document.getElementById('customDocTextInput');
const customFileInput = document.getElementById('customFileInput');

const btnOpenRegistry = document.getElementById('btnOpenRegistry');
const registryCountBadge = document.getElementById('registryCountBadge');
const registryModal = document.getElementById('registryModal');
const btnCloseRegistryModal = document.getElementById('btnCloseRegistryModal');
const registrySearchInput = document.getElementById('registrySearchInput');
const registryDocsContainer = document.getElementById('registryDocsContainer');
const btnExportFullRegistry = document.getElementById('btnExportFullRegistry');
const importRegistryFileInput = document.getElementById('importRegistryFileInput');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Ensure sample documents are pre-seeded in registry if empty
  seedSampleDocumentsIfEmpty();

  initDocSelector();
  setupTabNavigation();
  setupEventListeners();

  // Load first document by default
  const allDocs = getAllAvailableDocuments();
  if (allDocs.length > 0) {
    loadDocument(allDocs[0]);
  }
});

// Seed benchmark sample documents into registry if empty
function seedSampleDocumentsIfEmpty() {
  const stored = getStoredDocuments();
  if (stored.length === 0) {
    SAMPLE_DOCUMENTS.forEach((doc) => {
      const parsed = parseDocumentText(doc.rawContent, doc.id);
      const audit = runComplianceAudit(parsed);
      const summary = generateVerifiableSummary(parsed, audit);

      const record = {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        description: doc.description,
        addedAt: new Date().toISOString(),
        rawContent: doc.rawContent,
        isSample: true,
        structuredData: {
          metadata: parsed.metadata,
          sections: parsed.sections,
          summary,
          auditResults: audit
        }
      };
      saveDocumentToRegistry(record);
    });
  }
}

// Get all documents (stored + sample fallback)
function getAllAvailableDocuments() {
  const stored = getStoredDocuments();
  if (stored.length > 0) return stored;
  return SAMPLE_DOCUMENTS;
}

// Populate document dropdown
function initDocSelector() {
  const allDocs = getAllAvailableDocuments();
  docSelect.innerHTML = '';

  allDocs.forEach((doc) => {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = `${doc.category} — ${doc.title} ${doc.isSample ? '(Sample)' : '(Stored)'}`;
    docSelect.appendChild(opt);
  });

  registryCountBadge.textContent = allDocs.length;

  docSelect.addEventListener('change', (e) => {
    const selected = allDocs.find((d) => d.id === e.target.value);
    if (selected) loadDocument(selected);
  });
}

// Load and process document
function loadDocument(docData) {
  activeDocData = docData;
  activeDocTitle.textContent = docData.title;
  activeDocMeta.textContent = `${docData.category} | ${docData.description || 'Stored Medical Document'}`;

  // Parse raw text line-by-line
  parsedDoc = parseDocumentText(docData.rawContent, docData.id);
  lineCountTag.textContent = `${parsedDoc.metadata.totalLines} Lines`;

  // Render Document Lines
  renderDocumentLines(parsedDoc.lines);

  // Run Compliance Audit & Summary
  auditResults = runComplianceAudit(parsedDoc);
  summaryData = generateVerifiableSummary(parsedDoc, auditResults);

  // Render Studio Views
  renderAuditMatrix(auditResults);
  renderSummaryView(summaryData);
  renderSchemaView();
  resetQAView();

  // Update selector value if matching
  if (docSelect.value !== docData.id) {
    docSelect.value = docData.id;
  }
}

// Render Document Viewer Lines
function renderDocumentLines(lines, filterTerm = '') {
  docLinesContainer.innerHTML = '';
  const termLower = filterTerm.toLowerCase().trim();

  lines.forEach((line) => {
    if (termLower && !line.text.toLowerCase().includes(termLower) && line.lineNumber.toString() !== termLower) {
      return;
    }

    const lineRow = document.createElement('div');
    lineRow.className = `doc-line-row ${activeHighlightLine === line.lineNumber ? 'highlight-active' : ''}`;
    lineRow.id = `doc-line-${line.lineNumber}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'line-num';
    numSpan.textContent = line.lineNumber;

    const contentSpan = document.createElement('span');
    contentSpan.className = 'line-content';
    contentSpan.textContent = line.text;

    // Render tag badges
    line.tags.forEach((t) => {
      const tagSpan = document.createElement('span');
      tagSpan.className = `line-tag tag-${t.type}`;
      tagSpan.textContent = t.label;
      contentSpan.appendChild(tagSpan);
    });

    lineRow.appendChild(numSpan);
    lineRow.appendChild(contentSpan);
    docLinesContainer.appendChild(lineRow);
  });
}

// Jump to specific line and apply glowing highlight effect
function jumpToLine(lineNumber, endLine = lineNumber) {
  activeHighlightLine = lineNumber;
  renderDocumentLines(parsedDoc.lines, docSearchInput.value);

  const targetElem = document.getElementById(`doc-line-${lineNumber}`);
  if (targetElem) {
    targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetElem.classList.add('highlight-active');
    
    setTimeout(() => {
      for (let l = lineNumber; l <= endLine; l++) {
        const row = document.getElementById(`doc-line-${l}`);
        if (row) row.classList.add('highlight-active');
      }
    }, 100);
  }
}

// Render Audit Matrix View
function renderAuditMatrix(results) {
  const stats = summaryData.stats || {};
  statRisk.textContent = stats.riskLevel ? stats.riskLevel.split(' ')[0] : 'N/A';
  statRisk.style.color = stats.violations > 0 ? '#fb7185' : stats.advisories > 0 ? '#fbbf24' : '#34d399';
  
  statCompliant.textContent = stats.compliant || 0;
  statAdvisory.textContent = stats.advisories || 0;
  statViolation.textContent = stats.violations || 0;

  auditGridContainer.innerHTML = '';

  if (results.length === 0) {
    auditGridContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No compliance audit items generated for this document.</div>';
    return;
  }

  results.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'audit-item-card';

    const statusClass = item.status === 'compliant' ? 'badge-compliant' : item.status === 'advisory' ? 'badge-advisory' : 'badge-violation';

    card.innerHTML = `
      <div class="audit-item-header">
        <div class="audit-item-title">[${item.id}] ${item.title}</div>
        <span class="status-badge ${statusClass}">${item.status}</span>
      </div>
      <div class="audit-finding-text">${item.findings}</div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span class="citation-pill" data-start="${item.citation.startLine}" data-end="${item.citation.endLine}">
          📍 Citation: Lines ${item.citation.startLine}-${item.citation.endLine}
        </span>
        <span style="font-size: 0.72rem; color: var(--text-dim);">${item.category}</span>
      </div>
      <div class="verbatim-quote-box">
        "${item.verbatimQuote}"
      </div>
    `;

    const pill = card.querySelector('.citation-pill');
    pill.addEventListener('click', () => {
      jumpToLine(parseInt(pill.dataset.start, 10), parseInt(pill.dataset.end, 10));
    });

    auditGridContainer.appendChild(card);
  });
}

// Render Verifiable Summary View
function renderSummaryView(summary) {
  summaryOverviewText.textContent = summary.overview;
  summaryTakeawaysContainer.innerHTML = '';

  summary.keyTakeaways.forEach((takeaway) => {
    const row = document.createElement('div');
    row.style.cssText = 'background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-card); padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;';

    row.innerHTML = `
      <div>
        <strong style="color: var(--text-main); font-size: 0.85rem;">${takeaway.topic}:</strong>
        <span style="color: #cbd5e1; font-size: 0.82rem; margin-left: 6px;">${takeaway.text}</span>
      </div>
      <span class="citation-pill" data-start="${takeaway.citation.startLine}" data-end="${takeaway.citation.endLine}">
        Line ${takeaway.citation.startLine}
      </span>
    `;

    const pill = row.querySelector('.citation-pill');
    pill.addEventListener('click', () => {
      jumpToLine(parseInt(pill.dataset.start, 10), parseInt(pill.dataset.end, 10));
    });

    summaryTakeawaysContainer.appendChild(row);
  });
}

// Render Tab 4: Structured Schema View
function renderSchemaView() {
  if (!parsedDoc || !summaryData) return;

  const schemaPayload = {
    documentId: activeDocData.id,
    title: activeDocData.title,
    category: activeDocData.category,
    description: activeDocData.description,
    addedTimestamp: activeDocData.addedAt || new Date().toISOString(),
    parsingMetadata: parsedDoc.metadata,
    sections: parsedDoc.sections,
    complianceStats: summaryData.stats,
    auditMatrix: auditResults.map((a) => ({
      ruleId: a.id,
      category: a.category,
      title: a.title,
      status: a.status,
      findings: a.findings,
      lineCitation: a.citation,
      verbatimQuote: a.verbatimQuote,
      recommendation: a.recommendation
    })),
    indexedLinesPreview: parsedDoc.lines.slice(0, 10).map((l) => ({
      line: l.lineNumber,
      section: l.section,
      text: l.text,
      tags: l.tags
    }))
  };

  schemaJSONView.textContent = JSON.stringify(schemaPayload, null, 2);
}

// Grounded Q&A Execution
function handleAskQuery(queryText) {
  if (!queryText.trim()) return;

  const result = answerGroundedQuery(queryText, parsedDoc, auditResults);

  qaResponseContainer.innerHTML = `
    <div class="qa-response-card">
      <div class="response-header">
        <strong style="font-family: var(--font-heading); color: var(--primary-cyan); font-size: 0.95rem;">
          Grounded Verification Response
        </strong>
        <div class="confidence-indicator">
          <span>🛡️ ${result.confidence}% Evidence Grounding</span>
        </div>
      </div>

      <div style="font-size: 0.88rem; color: #f8fafc; line-height: 1.6; margin-bottom: 14px; white-space: pre-wrap;">
        ${result.answer}
      </div>

      ${
        result.citation
          ? `<button class="citation-pill" id="qaResponseCitationBtn" style="margin-bottom: 14px;">
              📍 Jump to Citation (Lines ${result.citation.startLine}-${result.citation.endLine})
             </button>`
          : ''
      }

      <div style="font-weight: 600; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
        Verbatim Source Excerpts:
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;">
        ${result.excerpts
          .map(
            (e) => `
          <div style="background: rgba(10, 15, 26, 0.7); padding: 8px 12px; border-left: 2px solid var(--primary-cyan); font-family: var(--font-code); font-size: 0.76rem; color: #94a3b8;">
            Line ${e.lineNumber}: "${e.text}"
          </div>
        `
          )
          .join('')}
      </div>

      <div style="font-weight: 600; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 4px;">
        Verification Chain of Thought:
      </div>
      <ul class="reasoning-list">
        ${result.reasoning.map((r) => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  `;

  if (result.citation) {
    document.getElementById('qaResponseCitationBtn').addEventListener('click', () => {
      jumpToLine(result.citation.startLine, result.citation.endLine);
    });
  }
}

function resetQAView() {
  qaResponseContainer.innerHTML = `
    <div style="text-align: center; color: var(--text-dim); padding: 40px 20px; font-size: 0.88rem;">
      💬 Select a suggested question above or type a custom query to see grounded answers with verbatim line citations.
    </div>
  `;
  qaInput.value = '';
}

// Render Document Registry Modal
function renderDocumentRegistry(searchTerm = '') {
  const docs = getStoredDocuments();
  const term = searchTerm.toLowerCase().trim();

  registryDocsContainer.innerHTML = '';

  const filtered = docs.filter((d) => {
    if (!term) return true;
    return (
      d.title.toLowerCase().includes(term) ||
      d.category.toLowerCase().includes(term) ||
      (d.structuredData?.summary?.stats?.riskLevel || '').toLowerCase().includes(term)
    );
  });

  if (filtered.length === 0) {
    registryDocsContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
        No medical documents match your search in the persistent registry.
      </div>
    `;
    return;
  }

  filtered.forEach((doc) => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid var(--border-card);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      transition: all 0.2s ease;
    `;

    const stats = doc.structuredData?.summary?.stats || {};
    const riskColor = stats.violations > 0 ? '#fb7185' : stats.advisories > 0 ? '#fbbf24' : '#34d399';
    const dateFormatted = new Date(doc.addedAt || Date.now()).toLocaleString();

    card.innerHTML = `
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${doc.title}</span>
          <span class="status-badge" style="background: rgba(6, 182, 212, 0.15); color: var(--primary-cyan); font-size: 0.68rem;">
            ${doc.category}
          </span>
          <span class="status-badge" style="background: rgba(255, 255, 255, 0.05); color: ${riskColor}; font-size: 0.68rem;">
            ${stats.riskLevel || 'Audited'}
          </span>
        </div>
        <div style="font-size: 0.76rem; color: var(--text-dim);">
          Added: ${dateFormatted} | ${stats.totalLines || 0} Lines | ${stats.wordCount || 0} Words
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button class="btn btn-primary btn-load-doc" data-id="${doc.id}" style="padding: 6px 12px; font-size: 0.78rem;">
          ⚡ Load & Audit
        </button>
        ${
          !doc.isSample
            ? `<button class="btn btn-secondary btn-delete-doc" data-id="${doc.id}" style="padding: 6px 10px; font-size: 0.75rem; color: #fb7185;" title="Delete Document">
                🗑️
               </button>`
            : ''
        }
      </div>
    `;

    // Button Listeners
    card.querySelector('.btn-load-doc').addEventListener('click', () => {
      registryModal.style.display = 'none';
      loadDocument(doc);
    });

    const deleteBtn = card.querySelector('.btn-delete-doc');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to remove "${doc.title}" from the registry?`)) {
          deleteDocumentFromRegistry(doc.id);
          initDocSelector();
          renderDocumentRegistry(registrySearchInput.value);
        }
      });
    }

    registryDocsContainer.appendChild(card);
  });
}

// Tab Navigation
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      document.getElementById('tabContentAudit').style.display = target === 'audit' ? 'block' : 'none';
      document.getElementById('tabContentSummary').style.display = target === 'summary' ? 'block' : 'none';
      document.getElementById('tabContentQA').style.display = target === 'qa' ? 'block' : 'none';
      document.getElementById('tabContentSchema').style.display = target === 'schema' ? 'block' : 'none';
    });
  });
}

// Event Listeners Setup
function setupEventListeners() {
  // Document Search
  docSearchInput.addEventListener('input', (e) => {
    renderDocumentLines(parsedDoc.lines, e.target.value);
  });

  // Copy Schema JSON
  btnCopySchemaJSON.addEventListener('click', () => {
    navigator.clipboard.writeText(schemaJSONView.textContent);
    btnCopySchemaJSON.textContent = '✓ Copied!';
    setTimeout(() => {
      btnCopySchemaJSON.textContent = '📋 Copy JSON';
    }, 2000);
  });

  // Grounded Q&A button & input
  btnAskQA.addEventListener('click', () => handleAskQuery(qaInput.value));
  qaInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAskQuery(qaInput.value);
  });

  // Suggested Prompts
  suggestedPromptsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('prompt-chip')) {
      const q = e.target.dataset.query;
      qaInput.value = q;
      document.querySelector('[data-tab="qa"]').click();
      handleAskQuery(q);
    }
  });

  // Quick Demo Trigger
  btnQuickDemo.addEventListener('click', () => {
    btnQuickDemo.innerHTML = '<span>⚡ Running Live Audit...</span>';
    setTimeout(() => {
      const allDocs = getAllAvailableDocuments();
      loadDocument(allDocs[0]);
      document.querySelector('[data-tab="audit"]').click();
      btnQuickDemo.innerHTML = '<span>✨ Run Demo Audit</span>';
      if (auditResults.length > 1) {
        jumpToLine(auditResults[1].citation.startLine, auditResults[1].citation.endLine);
      }
    }, 600);
  });

  // Registry Modal
  btnOpenRegistry.addEventListener('click', () => {
    renderDocumentRegistry();
    registryModal.style.display = 'flex';
  });

  btnCloseRegistryModal.addEventListener('click', () => {
    registryModal.style.display = 'none';
  });

  registrySearchInput.addEventListener('input', (e) => {
    renderDocumentRegistry(e.target.value);
  });

  btnExportFullRegistry.addEventListener('click', () => {
    const json = exportRegistryJSON();
    downloadFile(json, 'verimed-knowledge-base-backup.json', 'application/json');
  });

  importRegistryFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const count = importRegistryJSON(event.target.result);
        alert(`Successfully imported and restored ${count} medical documents into registry!`);
        initDocSelector();
        renderDocumentRegistry();
      };
      reader.readAsText(file);
    }
  });

  // Export Modal
  btnExport.addEventListener('click', () => {
    const md = exportToMarkdown(activeDocData.title, parsedDoc, summaryData, auditResults);
    exportPreviewCode.textContent = md;
    exportModal.style.display = 'flex';
  });

  btnCloseExportModal.addEventListener('click', () => {
    exportModal.style.display = 'none';
  });

  btnDownloadMarkdown.addEventListener('click', () => {
    const md = exportToMarkdown(activeDocData.title, parsedDoc, summaryData, auditResults);
    downloadFile(md, `${activeDocData.id}-audit-report.md`, 'text/markdown');
  });

  // Custom Upload & Persistent Storage Modal
  btnUploadModal.addEventListener('click', () => {
    uploadModal.style.display = 'flex';
  });

  btnCloseUploadModal.addEventListener('click', () => {
    uploadModal.style.display = 'none';
  });

  // File Upload helper in custom modal
  customFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!customDocTitleInput.value) {
        customDocTitleInput.value = file.name.replace(/\.[^/.]+$/, '');
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        customDocTextInput.value = ev.target.result;
      };
      reader.readAsText(file);
    }
  });

  btnIngestCustomDoc.addEventListener('click', () => {
    const title = customDocTitleInput.value.trim() || 'Custom Uploaded Medical Document';
    const category = customDocCategorySelect.value || 'Custom Upload';
    const text = customDocTextInput.value.trim();

    if (!text) {
      alert('Please paste or upload document text to audit.');
      return;
    }

    const docId = `custom-doc-${Date.now()}`;
    const parsed = parseDocumentText(text, docId);
    const audit = runComplianceAudit(parsed);
    const summary = generateVerifiableSummary(parsed, audit);

    const docRecord = {
      id: docId,
      title,
      category,
      description: `Ingested ${new Date().toLocaleDateString()} — ${parsed.metadata.totalLines} lines`,
      addedAt: new Date().toISOString(),
      rawContent: text,
      isSample: false,
      structuredData: {
        metadata: parsed.metadata,
        sections: parsed.sections,
        summary,
        auditResults: audit
      }
    };

    // Save to persistent registry
    saveDocumentToRegistry(docRecord);
    initDocSelector();

    uploadModal.style.display = 'none';
    customDocTextInput.value = '';
    customDocTitleInput.value = '';

    // Load newly ingested document immediately
    loadDocument(docRecord);
    document.querySelector('[data-tab="audit"]').click();
  });
}
