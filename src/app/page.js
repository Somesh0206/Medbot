"use client";
import React, { useState, useEffect, useRef } from 'react';
import { SAMPLE_DOCUMENTS } from '@/lib/sampleData';
import { parseDocumentText } from '@/lib/parser';
import { runComplianceAudit } from '@/lib/auditEngine';
import { generateVerifiableSummary } from '@/lib/summaryEngine';
import { answerGroundedQuery } from '@/lib/qaEngine';
import { exportToMarkdown, exportToJSON, downloadFile } from '@/lib/exportUtils';
import {
  getStoredDocuments,
  saveDocumentToRegistry,
  deleteDocumentFromRegistry,
  exportRegistryFileJSON,
  importRegistryFileJSON
} from '@/lib/storageEngine';
import { extractTextFromFile } from '@/lib/fileExtractor';

export default function VeriMedApp() {
  const [allDocs, setAllDocs] = useState([]);
  const [activeDocData, setActiveDocData] = useState(null);
  const [parsedDoc, setParsedDoc] = useState(null);
  const [auditResults, setAuditResults] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [activeHighlightLine, setActiveHighlightLine] = useState(null);
  
  const [activeTab, setActiveTab] = useState('audit'); // audit, summary, qa, schema
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [qaQuery, setQaQuery] = useState('');
  const [qaResponse, setQaResponse] = useState(null);
  
  const [showRegistryModal, setShowRegistryModal] = useState(false);
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [registryFileFilter, setRegistryFileFilter] = useState('all'); // all, patients, policies
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [customDocTitle, setCustomDocTitle] = useState('');
  const [customDocCategory, setCustomDocCategory] = useState('General');
  const [customTargetFile, setCustomTargetFile] = useState('patients'); // patients, policies
  const [customDocText, setCustomDocText] = useState('');
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [isExtractingFile, setIsExtractingFile] = useState(false);

  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);

  useEffect(() => {
    // Initialization: Seed sample docs if empty, load docs into 2 separate files
    let stored = getStoredDocuments('all');
    if (stored.length === 0) {
      SAMPLE_DOCUMENTS.forEach((doc) => {
        const parsed = parseDocumentText(doc.rawContent, doc.id);
        const audit = runComplianceAudit(parsed);
        const summary = generateVerifiableSummary(parsed, audit);
        
        // Categorize into patients file vs policies file
        const targetFile = (doc.id.includes('hearing') || doc.id.includes('transcript') || doc.category.includes('Transcript')) ? 'patients' : 'policies';
        
        const record = {
          id: doc.id,
          title: doc.title,
          category: doc.category,
          targetFile,
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
        saveDocumentToRegistry(record, targetFile);
      });
      stored = getStoredDocuments('all');
    }
    
    setAllDocs(stored.length > 0 ? stored : SAMPLE_DOCUMENTS);
    if (stored.length > 0) {
      handleLoadDocument(stored[0]);
    }
  }, []);

  const reloadAllDocs = (filter = registryFileFilter) => {
    const updated = getStoredDocuments(filter);
    setAllDocs(updated);
  };

  const handleLoadDocument = (docData) => {
    setActiveDocData(docData);
    const parsed = parseDocumentText(docData.rawContent, docData.id);
    setParsedDoc(parsed);
    const audit = runComplianceAudit(parsed);
    setAuditResults(audit);
    setSummaryData(generateVerifiableSummary(parsed, audit));
    setQaResponse(null);
    setQaQuery('');
    setDocSearchQuery('');
    setActiveHighlightLine(null);
  };

  const jumpToLine = (startLine, endLine = startLine) => {
    setActiveHighlightLine(startLine);
    const elem = document.getElementById(`doc-line-${startLine}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleAskQuery = (query) => {
    if (!query.trim()) return;
    const result = answerGroundedQuery(query, parsedDoc, auditResults);
    setQaResponse(result);
  };

  const handleQuickDemo = () => {
    setIsDemoRunning(true);
    setTimeout(() => {
      const docs = getStoredDocuments('all');
      const docsToUse = docs.length > 0 ? docs : SAMPLE_DOCUMENTS;
      if (docsToUse.length > 0) {
        handleLoadDocument(docsToUse[0]);
      }
      setActiveTab('audit');
      setIsDemoRunning(false);
      setTimeout(() => {
        if (auditResults.length > 1) {
          jumpToLine(auditResults[1].citation.startLine, auditResults[1].citation.endLine);
        }
      }, 100);
    }, 600);
  };

  const handleDeleteDoc = (id, targetFile) => {
    if (confirm("Are you sure you want to remove this document from the registry file?")) {
      deleteDocumentFromRegistry(id, targetFile);
      const updatedDocs = getStoredDocuments(registryFileFilter);
      setAllDocs(updatedDocs);
      if (activeDocData?.id === id && updatedDocs.length > 0) {
        handleLoadDocument(updatedDocs[0]);
      }
    }
  };

  const handleIngestCustomDoc = () => {
    const title = customDocTitle.trim() || 'Custom Uploaded Medical Document';
    const text = customDocText.trim();
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
      category: customDocCategory,
      targetFile: customTargetFile,
      description: `Ingested ${new Date().toLocaleDateString()} — ${parsed.metadata.totalLines} lines (${customTargetFile === 'patients' ? 'Patient Record' : 'Hospital Policy'})`,
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
    saveDocumentToRegistry(docRecord, customTargetFile);
    reloadAllDocs();
    setShowUploadModal(false);
    setCustomDocText('');
    setCustomDocTitle('');
    handleLoadDocument(docRecord);
    setActiveTab('audit');
  };

  const handleCustomFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!customDocTitle) {
        setCustomDocTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setIsExtractingFile(true);
      try {
        const text = await extractTextFromFile(file);
        setCustomDocText(text);
      } catch (err) {
        alert('Failed to extract text from file: ' + err.message);
      } finally {
        setIsExtractingFile(false);
      }
    }
  };

  const handleImportRegistryFile = (e, targetFile) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const count = importRegistryFileJSON(ev.target.result, targetFile);
        alert(`Successfully imported ${count} documents into ${targetFile === 'patients' ? 'Patient Records File' : 'Hospital Policies File'}!`);
        reloadAllDocs();
      };
      reader.readAsText(file);
    }
  };

  const getFilteredLines = () => {
    if (!parsedDoc?.lines) return [];
    const term = docSearchQuery.toLowerCase().trim();
    if (!term) return parsedDoc.lines;
    return parsedDoc.lines.filter((line) => 
      line.text.toLowerCase().includes(term) || line.lineNumber.toString() === term
    );
  };

  const getFilteredRegistryDocs = () => {
    let docs = getStoredDocuments(registryFileFilter);
    const term = registrySearchQuery.toLowerCase().trim();
    if (term) {
      docs = docs.filter(d => 
        d.title.toLowerCase().includes(term) ||
        d.category.toLowerCase().includes(term) ||
        (d.structuredData?.summary?.stats?.riskLevel || '').toLowerCase().includes(term)
      );
    }
    return docs;
  };

  const schemaPayload = activeDocData && parsedDoc && summaryData ? {
    documentId: activeDocData.id,
    title: activeDocData.title,
    category: activeDocData.category,
    targetStorageFile: activeDocData.targetFile || 'policies',
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
  } : null;

  const patientDocsCount = getStoredDocuments('patients').length;
  const policyDocsCount = getStoredDocuments('policies').length;

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="brand-container">
          <div className="brand-logo">V</div>
          <div className="brand-text">
            <h1>VeriMed AI Audit Studio</h1>
            <p>Verifiable Medical & Governance Compliance Engine</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowRegistryModal(true)}>
            📁 Files: 📋 Patients ({patientDocsCount}) | 🏥 Policies ({policyDocsCount})
          </button>
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            ➕ Ingest Document
          </button>
          <button className="btn btn-secondary" onClick={handleQuickDemo} disabled={isDemoRunning}>
            {isDemoRunning ? '⏳ Running...' : '⚡ Quick Demo'}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="main-layout">
        {/* Left Panel: Document Viewer */}
        <div className="left-panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)' }}>Indexed Document Stream</h2>
                <span className="badge badge-info">{parsedDoc?.metadata?.totalLines || 0} Lines</span>
                {activeDocData?.targetFile && (
                  <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>
                    {activeDocData.targetFile === 'patients' ? '📋 Patient Records File' : '🏥 Hospital Policies File'}
                  </span>
                )}
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.72rem' }} onClick={() => setShowRegistryModal(true)}>Switch Document 🔁</button>
            </div>
            <div style={{ width: '100%' }}>
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search indexed verbatim lines..." 
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="document-stream">
            {getFilteredLines().length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
                No document lines match your search filter "{docSearchQuery}".
              </div>
            ) : (
              getFilteredLines().map((line) => {
                const isHighlighted = activeHighlightLine === line.lineNumber;
                return (
                  <div 
                    key={line.lineNumber} 
                    id={`doc-line-${line.lineNumber}`}
                    className={`document-line ${isHighlighted ? 'highlighted' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                      padding: '6px 12px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      background: isHighlighted ? 'rgba(6, 182, 212, 0.22)' : 'transparent',
                      borderLeft: isHighlighted ? '4px solid var(--primary-cyan)' : '4px solid transparent'
                    }}
                    onClick={() => setActiveHighlightLine(line.lineNumber)}
                  >
                    <span 
                      style={{
                        fontFamily: 'var(--font-code)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: isHighlighted ? 'var(--primary-cyan)' : '#38bdf8',
                        background: 'rgba(6, 182, 212, 0.12)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        userSelect: 'none'
                      }}
                    >
                      #{line.lineNumber}
                    </span>
                    <span style={{ fontSize: '0.84rem', color: isHighlighted ? '#ffffff' : '#cbd5e1', lineHeight: 1.5, flex: 1, wordBreak: 'break-word' }}>
                      {line.section && (
                        <span className="section-tag" style={{ marginRight: '6px', fontSize: '0.72rem' }}>
                          [{line.section}]
                        </span>
                      )}
                      {line.text}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Audit & Verification Suite */}
        <div className="right-panel">
          <div className="panel-tabs">
            <button className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
              🛡️ Audit Matrix ({auditResults.length})
            </button>
            <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
              📊 Executive Summary
            </button>
            <button className={`tab-btn ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>
              💬 Grounded Q&A
            </button>
            <button className={`tab-btn ${activeTab === 'schema' ? 'active' : ''}`} onClick={() => setActiveTab('schema')}>
              ⚙️ JSON Schema
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'audit' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)', color: 'var(--text-main)' }}>
                      Compliance & Statutory Rules Matrix
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Automated audit findings with verbatim source citations
                    </span>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setShowExportModal(true)}>
                    📤 Export Report
                  </button>
                </div>

                <div className="audit-matrix-grid">
                  {auditResults.map((rule) => {
                    const statusClass = rule.status === 'VIOLATION' ? 'status-violation' : rule.status === 'ADVISORY' ? 'status-advisory' : 'status-compliant';
                    const icon = rule.status === 'VIOLATION' ? '🚨' : rule.status === 'ADVISORY' ? '⚠️' : '✅';
                    return (
                      <div key={rule.id} className="audit-card">
                        <div className="audit-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{icon}</span>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{rule.title}</strong>
                          </div>
                          <span className={`status-badge ${statusClass}`}>{rule.status}</span>
                        </div>
                        <p className="findings-text">{rule.findings}</p>
                        
                        {rule.citation && (
                          <div style={{ marginBottom: '10px' }}>
                            <button className="citation-pill" onClick={() => jumpToLine(rule.citation.startLine, rule.citation.endLine)}>
                              📍 Verbatim Citation: Lines {rule.citation.startLine}–{rule.citation.endLine}
                            </button>
                            {rule.verbatimQuote && (
                              <div className="verbatim-quote">
                                "{rule.verbatimQuote}"
                              </div>
                            )}
                          </div>
                        )}

                        <div className="recommendation-box">
                          💡 <strong>Actionable Fix:</strong> {rule.recommendation}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'summary' && summaryData && (
              <div>
                <div className="summary-stats-grid">
                  <div className="stat-card">
                    <span className="stat-label">Document Risk Level</span>
                    <span className="stat-value" style={{ color: summaryData.stats.violations > 0 ? '#fb7185' : '#34d399' }}>
                      {summaryData.stats.riskLevel}
                    </span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Violations Detected</span>
                    <span className="stat-value" style={{ color: '#fb7185' }}>{summaryData.stats.violations}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Advisories Issued</span>
                    <span className="stat-value" style={{ color: '#fbbf24' }}>{summaryData.stats.advisories}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Compliance Score</span>
                    <span className="stat-value" style={{ color: '#38bdf8' }}>{summaryData.stats.complianceScore}%</span>
                  </div>
                </div>

                <div className="summary-section">
                  <h4 style={{ color: 'var(--primary-cyan)', fontSize: '0.9rem', marginBottom: '8px', fontFamily: 'var(--font-heading)' }}>
                    Executive Overview
                  </h4>
                  <p style={{ fontSize: '0.86rem', color: '#cbd5e1', lineHeight: 1.6 }}>{summaryData.overview}</p>
                </div>

                <div className="summary-section">
                  <h4 style={{ color: 'var(--primary-cyan)', fontSize: '0.9rem', marginBottom: '8px', fontFamily: 'var(--font-heading)' }}>
                    Verifiable Compliance Highlights
                  </h4>
                  {summaryData.takeaways.map((takeaway, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--primary-cyan)' }}>•</span>
                      <span style={{ fontSize: '0.84rem', color: '#e2e8f0', flex: 1 }}>{takeaway.text}</span>
                      <span className="citation-pill" style={{ cursor: 'pointer' }} onClick={() => jumpToLine(takeaway.citation.startLine)}>
                        Line {takeaway.citation.startLine}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>📤 Export Markdown</button>
                  <button className="btn btn-secondary" onClick={() => {
                    const json = exportToJSON(activeDocData.title, parsedDoc, summaryData, auditResults);
                    downloadFile(json, `${activeDocData.id}-audit-data.json`, 'application/json');
                  }}>📥 Download JSON</button>
                </div>
              </div>
            )}

            {activeTab === 'qa' && (
              <div className="qa-container">
                <div style={{ marginBottom: '12px', fontSize: '0.82rem', color: 'var(--primary-cyan)', fontWeight: 500 }}>
                  💬 Document Q&A Assistant — Querying "{activeDocData?.title || 'Inserted Document'}" ({parsedDoc?.metadata?.totalLines || 0} indexed lines)
                </div>
                <div className="suggested-prompts">
                  <span className="prompt-chip" onClick={() => { const q = 'What are the main requirements and rules in this document?'; setQaQuery(q); handleAskQuery(q); }}>
                    📌 Main requirements & rules
                  </span>
                  <span className="prompt-chip" onClick={() => { const q = 'What emergency or safety procedures are listed?'; setQaQuery(q); handleAskQuery(q); }}>
                    🚨 Emergency & safety rules
                  </span>
                  <span className="prompt-chip" onClick={() => { const q = 'Are there any mandatory compliance steps or logging required?'; setQaQuery(q); handleAskQuery(q); }}>
                    📋 Mandatory compliance steps
                  </span>
                </div>
                <div className="query-input-box">
                  <input 
                    type="text" 
                    className="search-input" 
                    placeholder={`Ask any question from "${activeDocData?.title || 'inserted document'}"...`} 
                    value={qaQuery}
                    onChange={(e) => setQaQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuery(qaQuery)}
                  />
                  <button className="btn btn-primary" onClick={() => handleAskQuery(qaQuery)}>Ask ✨</button>
                </div>

                {qaResponse ? (
                  <div className="qa-response-card">
                    <div className="response-header">
                      <strong style={{ fontFamily: 'var(--font-heading)', color: 'var(--primary-cyan)', fontSize: '0.95rem' }}>
                        Grounded Answer Verification
                      </strong>
                      <div className="confidence-indicator">
                        <span>🛡️ {qaResponse.confidence}% Evidence Grounding</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#f8fafc', lineHeight: 1.6, marginBottom: '14px', whiteSpace: 'pre-wrap' }}>
                      {qaResponse.answer}
                    </div>
                    {qaResponse.citation && (
                      <button className="citation-pill" style={{ marginBottom: '14px' }} onClick={() => jumpToLine(qaResponse.citation.startLine, qaResponse.citation.endLine)}>
                        📍 Jump to Citation (Lines {qaResponse.citation.startLine}-{qaResponse.citation.endLine})
                      </button>
                    )}
                    <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Verbatim Source Excerpts from Inserted Document:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      {qaResponse.excerpts.map((e, idx) => (
                        <div key={idx} style={{ background: 'rgba(10, 15, 26, 0.7)', padding: '8px 12px', borderLeft: '2px solid var(--primary-cyan)', fontFamily: 'var(--font-code)', fontSize: '0.76rem', color: '#94a3b8' }}>
                          Line {e.lineNumber} ({e.section}): "{e.text}"
                        </div>
                      ))}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Verification Chain of Thought:
                    </div>
                    <ul className="reasoning-list">
                      {qaResponse.reasoning.map((r, idx) => <li key={idx}>{r}</li>)}
                    </ul>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 20px', fontSize: '0.88rem' }}>
                    💬 Select a suggested prompt above or type any custom question to get grounded answers with verbatim line citations directly from your inserted document.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'schema' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Structured JSON Representation of Document & Audit</span>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={(e) => {
                    navigator.clipboard.writeText(JSON.stringify(schemaPayload, null, 2));
                    const orig = e.target.textContent;
                    e.target.textContent = '✓ Copied!';
                    setTimeout(() => e.target.textContent = orig, 2000);
                  }}>📋 Copy JSON</button>
                </div>
                <pre style={{ background: '#080c14', padding: '16px', borderRadius: '8px', fontSize: '0.8rem', color: '#a5b4fc', overflowX: 'auto', fontFamily: 'var(--font-code)' }}>
                  {schemaPayload ? JSON.stringify(schemaPayload, null, 2) : 'Loading...'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Ingest Medical Document</h3>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowUploadModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Target Storage Registry File</label>
                <select className="search-input" style={{ width: '100%', borderColor: 'var(--primary-cyan)' }} value={customTargetFile} onChange={e => setCustomTargetFile(e.target.value)}>
                  <option value="patients">📋 Patient Records File (patients_registry.json)</option>
                  <option value="policies">🏥 Hospital Policies File (policies_registry.json)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Document Title</label>
                <input type="text" className="search-input" style={{ width: '100%' }} value={customDocTitle} onChange={e => setCustomDocTitle(e.target.value)} placeholder="e.g. Patient Clinical History / Telemedicine SOP" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Category</label>
                <select className="search-input" style={{ width: '100%' }} value={customDocCategory} onChange={e => setCustomDocCategory(e.target.value)}>
                  <option value="Patient Records">Patient Records & Clinical Notes</option>
                  <option value="Telemedicine">Telemedicine Protocol</option>
                  <option value="Surgical">Surgical Governance</option>
                  <option value="Compliance">Regulatory Compliance</option>
                  <option value="General">General Medical Document</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Upload Document File (PDF, Word DOCX/DOC, Text, Markdown, CSV, JSON, HTML)
                </label>
                <input 
                  type="file" 
                  className="search-input" 
                  style={{ width: '100%', padding: '6px' }} 
                  accept=".pdf,.docx,.doc,.txt,.md,.json,.csv,.rtf,.html,.htm" 
                  ref={fileInputRef} 
                  onChange={handleCustomFileUpload} 
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📄 PDF (.pdf)</span>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📝 Word (.docx, .doc)</span>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📑 Text & MD (.txt, .md)</span>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📊 Data (.json, .csv, .html)</span>
                </div>
                {isExtractingFile && (
                  <div style={{ color: 'var(--primary-cyan)', fontSize: '0.78rem', marginTop: '6px' }}>
                    ⏳ Extracting text content from uploaded document...
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Extracted Document Text Content</label>
                <textarea className="search-input" style={{ width: '100%', height: '150px', resize: 'vertical' }} placeholder="Paste document text here or upload any PDF/Word/Text file above..." value={customDocText} onChange={e => setCustomDocText(e.target.value)}></textarea>
              </div>
              <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }} onClick={handleIngestCustomDoc}>
                ⚡ Save to {customTargetFile === 'patients' ? 'Patient Records File' : 'Hospital Policies File'} & Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Base Registry Modal */}
      {showRegistryModal && (
        <div className="modal-overlay" onClick={() => setShowRegistryModal(false)}>
          <div className="modal-content" style={{ width: '850px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Document Knowledge Base Files</h3>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowRegistryModal(false)}>✕</button>
            </div>
            
            {/* Target File Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', background: 'rgba(15, 23, 42, 0.6)', padding: '6px', borderRadius: '8px' }}>
              <button 
                className={`btn ${registryFileFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                onClick={() => setRegistryFileFilter('all')}
              >
                📁 All Inserted Files ({getStoredDocuments('all').length})
              </button>
              <button 
                className={`btn ${registryFileFilter === 'patients' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                onClick={() => setRegistryFileFilter('patients')}
              >
                📋 Patient Records File ({patientDocsCount})
              </button>
              <button 
                className={`btn ${registryFileFilter === 'policies' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                onClick={() => setRegistryFileFilter('policies')}
              >
                🏥 Hospital Policies File ({policyDocsCount})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <input type="text" className="search-input" style={{ flex: 1, minWidth: '200px' }} placeholder="Search current file registry..." value={registrySearchQuery} onChange={e => setRegistrySearchQuery(e.target.value)} />
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => {
                const json = exportRegistryFileJSON('patients');
                downloadFile(json, 'patients_registry.json', 'application/json');
              }}>📥 Download Patients File</button>
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => {
                const json = exportRegistryFileJSON('policies');
                downloadFile(json, 'policies_registry.json', 'application/json');
              }}>📥 Download Policies File</button>
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => importFileInputRef.current.click()}>Restore JSON File</button>
              <input type="file" style={{ display: 'none' }} accept=".json" ref={importFileInputRef} onChange={(e) => handleImportRegistryFile(e, registryFileFilter === 'all' ? 'patients' : registryFileFilter)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '6px' }}>
              {getFilteredRegistryDocs().length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>No documents found in this file registry.</div>
              ) : (
                getFilteredRegistryDocs().map(doc => {
                  const stats = doc.structuredData?.summary?.stats || {};
                  const riskColor = stats.violations > 0 ? '#fb7185' : stats.advisories > 0 ? '#fbbf24' : '#34d399';
                  const dateFormatted = new Date(doc.addedAt || Date.now()).toLocaleString();
                  const fileTag = doc.targetFile === 'patients' ? '📋 Patient Records File' : '🏥 Hospital Policies File';
                  return (
                    <div key={doc.id} style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-card)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{doc.title}</span>
                          <span className="status-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--primary-cyan)', fontSize: '0.68rem' }}>{fileTag}</span>
                          <span className="status-badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: riskColor, fontSize: '0.68rem' }}>{stats.riskLevel || 'Audited'}</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                          Category: {doc.category} | Added: {dateFormatted} | {stats.totalLines || 0} Lines
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => { setShowRegistryModal(false); handleLoadDocument(doc); }}>⚡ Load & Audit</button>
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} title="Download JSON" onClick={() => {
                          const json = exportToJSON(doc.title, doc.structuredData?.metadata ? { metadata: doc.structuredData.metadata, sections: doc.structuredData.sections, lines: parseDocumentText(doc.rawContent).lines } : parseDocumentText(doc.rawContent, doc.id), doc.structuredData?.summary || generateVerifiableSummary(parseDocumentText(doc.rawContent), runComplianceAudit(parseDocumentText(doc.rawContent))), doc.structuredData?.auditResults || runComplianceAudit(parseDocumentText(doc.rawContent)));
                          downloadFile(json, `${doc.id}-structured-schema.json`, 'application/json');
                        }}>📥 JSON</button>
                        {!doc.isSample && (
                          <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#fb7185' }} title="Delete Document" onClick={() => handleDeleteDoc(doc.id, doc.targetFile)}>🗑️</button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Export Verifiable Report</h3>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowExportModal(false)}>✕</button>
            </div>
            <div className="export-code-preview">
              {exportToMarkdown(activeDocData?.title || 'Report', parsedDoc, summaryData, auditResults)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                const md = exportToMarkdown(activeDocData?.title || 'Report', parsedDoc, summaryData, auditResults);
                downloadFile(md, `${activeDocData?.id || 'doc'}-audit-report.md`, 'text/markdown');
                setShowExportModal(false);
              }}>💾 Download Markdown</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
