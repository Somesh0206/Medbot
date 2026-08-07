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
  exportRegistryJSON,
  importRegistryJSON
} from '@/lib/storageEngine';

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
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [customDocTitle, setCustomDocTitle] = useState('');
  const [customDocCategory, setCustomDocCategory] = useState('General');
  const [customDocText, setCustomDocText] = useState('');
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);

  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);

  useEffect(() => {
    // Initialization: Seed sample docs if empty, load docs
    let stored = getStoredDocuments();
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
      stored = getStoredDocuments();
    }
    
    setAllDocs(stored.length > 0 ? stored : SAMPLE_DOCUMENTS);
    if (stored.length > 0) {
      handleLoadDocument(stored[0]);
    }
  }, []);

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
      const docs = getStoredDocuments();
      const docsToUse = docs.length > 0 ? docs : SAMPLE_DOCUMENTS;
      if (docsToUse.length > 0) {
        handleLoadDocument(docsToUse[0]);
      }
      setActiveTab('audit');
      setIsDemoRunning(false);
      // Timeout to ensure render before jumping
      setTimeout(() => {
        if (auditResults.length > 1) {
          jumpToLine(auditResults[1].citation.startLine, auditResults[1].citation.endLine);
        }
      }, 100);
    }, 600);
  };

  const handleDeleteDoc = (id) => {
    if (confirm("Are you sure you want to remove this from the registry?")) {
      deleteDocumentFromRegistry(id);
      const updatedDocs = getStoredDocuments();
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
    saveDocumentToRegistry(docRecord);
    const updatedDocs = getStoredDocuments();
    setAllDocs(updatedDocs);
    setShowUploadModal(false);
    setCustomDocText('');
    setCustomDocTitle('');
    handleLoadDocument(docRecord);
    setActiveTab('audit');
  };

  const handleCustomFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!customDocTitle) {
        setCustomDocTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCustomDocText(ev.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleImportRegistry = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const count = importRegistryJSON(ev.target.result);
        alert(`Successfully imported and restored ${count} medical documents into registry!`);
        const updatedDocs = getStoredDocuments();
        setAllDocs(updatedDocs);
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
    const term = registrySearchQuery.toLowerCase().trim();
    if (!term) return allDocs;
    return allDocs.filter(d => 
      d.title.toLowerCase().includes(term) ||
      d.category.toLowerCase().includes(term) ||
      (d.structuredData?.summary?.stats?.riskLevel || '').toLowerCase().includes(term)
    );
  };

  const schemaPayload = activeDocData && parsedDoc && summaryData ? {
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
  } : null;

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="brand-container">
          <div className="brand-logo">V</div>
          <div className="brand-title">VeriMed AI</div>
          <div className="brand-badge">Audit Studio</div>
        </div>
        <div className="header-controls">
          <select 
            className="doc-selector-select"
            value={activeDocData?.id || ''}
            onChange={(e) => {
              const doc = allDocs.find(d => d.id === e.target.value);
              if (doc) handleLoadDocument(doc);
            }}
          >
            {allDocs.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.category} — {doc.title} {doc.isSample ? '(Sample)' : '(Stored)'}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            + Ingest Document
          </button>
          <button className="btn btn-secondary" onClick={() => setShowRegistryModal(true)}>
            📚 Registry <span style={{ background: 'var(--primary-cyan)', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem' }}>{allDocs.length}</span>
          </button>
        </div>
      </header>

      {/* Banner */}
      <div className="hackathon-banner">
        <div className="hackathon-info">
          <span className="sparkle-icon">✨</span>
          <strong>Verifiable Medical Compliance Engine</strong>
          <span>Powered by deterministic rule-based auditing + LLM summarization.</span>
        </div>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={handleQuickDemo}>
          {isDemoRunning ? '⚡ Running Live Audit...' : '✨ Run Demo Audit'}
        </button>
      </div>

      {/* Main Workspace */}
      <div className="main-workspace">
        {/* Left Panel */}
        <div className="panel-card">
          <div className="panel-header">
            <div className="panel-title-group">
              <span style={{ fontSize: '1.2rem' }}>📄</span>
              <div>
                <div className="panel-title">{activeDocData?.title || 'Loading...'}</div>
                <div className="panel-subtitle">{activeDocData?.category} | {activeDocData?.description}</div>
              </div>
            </div>
            <div className="status-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--primary-cyan)' }}>
              {parsedDoc?.metadata?.totalLines || 0} Lines
            </div>
          </div>
          <div className="doc-search-box">
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search document lines..." 
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
            />
          </div>
          <div className="doc-lines-container">
            {getFilteredLines().map((line) => (
              <div 
                key={line.lineNumber} 
                id={`doc-line-${line.lineNumber}`}
                className={`doc-line-row ${activeHighlightLine === line.lineNumber ? 'highlight-active' : ''}`}
              >
                <span className="line-num">{line.lineNumber}</span>
                <span className="line-content">
                  {line.text}
                  {line.tags.map((t, idx) => (
                    <span key={idx} className={`line-tag tag-${t.type}`}>{t.label}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="panel-card">
          <div className="tab-bar">
            <button className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>🔍 Audit Matrix</button>
            <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>📊 Verifiable Summary</button>
            <button className={`tab-btn ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>💬 Grounded Q&A</button>
            <button className={`tab-btn ${activeTab === 'schema' ? 'active' : ''}`} onClick={() => setActiveTab('schema')}>⚙️ JSON Schema</button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'audit' && (
              <div>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-val" style={{ color: summaryData?.stats?.violations > 0 ? '#fb7185' : summaryData?.stats?.advisories > 0 ? '#fbbf24' : '#34d399' }}>
                      {summaryData?.stats?.riskLevel ? summaryData.stats.riskLevel.split(' ')[0] : 'N/A'}
                    </div>
                    <div className="stat-lbl">Risk Level</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val" style={{ color: '#34d399' }}>{summaryData?.stats?.compliant || 0}</div>
                    <div className="stat-lbl">Compliant</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val" style={{ color: '#fbbf24' }}>{summaryData?.stats?.advisories || 0}</div>
                    <div className="stat-lbl">Advisories</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val" style={{ color: '#fb7185' }}>{summaryData?.stats?.violations || 0}</div>
                    <div className="stat-lbl">Violations</div>
                  </div>
                </div>
                
                <div className="audit-grid">
                  {auditResults.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No compliance audit items generated for this document.</div>
                  ) : (
                    auditResults.map((item) => (
                      <div key={item.id} className="audit-item-card">
                        <div className="audit-item-header">
                          <div className="audit-item-title">[{item.id}] {item.title}</div>
                          <span className={`status-badge ${item.status === 'compliant' ? 'badge-compliant' : item.status === 'advisory' ? 'badge-advisory' : 'badge-violation'}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="audit-finding-text">{item.findings}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span className="citation-pill" onClick={() => jumpToLine(item.citation.startLine, item.citation.endLine)}>
                            📍 Citation: Lines {item.citation.startLine}-{item.citation.endLine}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{item.category}</span>
                        </div>
                        <div className="verbatim-quote-box">
                          "{item.verbatimQuote}"
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'summary' && summaryData && (
              <div>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px', color: '#f8fafc' }}>
                  {summaryData.overview}
                </div>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', color: 'var(--primary-cyan)', fontFamily: 'var(--font-heading)' }}>Key Grounded Takeaways</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {summaryData.keyTakeaways.map((takeaway, idx) => (
                    <div key={idx} style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid var(--border-card)', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <strong style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>{takeaway.topic}:</strong>
                        <span style={{ color: '#cbd5e1', fontSize: '0.82rem', marginLeft: '6px' }}>{takeaway.text}</span>
                      </div>
                      <span className="citation-pill" onClick={() => jumpToLine(takeaway.citation.startLine, takeaway.citation.endLine)}>
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
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Document Title</label>
                <input type="text" className="search-input" style={{ width: '100%' }} value={customDocTitle} onChange={e => setCustomDocTitle(e.target.value)} placeholder="e.g. Acme Health Telemedicine Policy" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Category</label>
                <select className="search-input" style={{ width: '100%' }} value={customDocCategory} onChange={e => setCustomDocCategory(e.target.value)}>
                  <option value="General">General Medical Policy</option>
                  <option value="Telemedicine">Telemedicine Protocol</option>
                  <option value="Surgical">Surgical Governance</option>
                  <option value="Compliance">Regulatory Compliance</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Upload File (TXT, MD)</label>
                <input type="file" className="search-input" style={{ width: '100%', padding: '6px' }} accept=".txt,.md" ref={fileInputRef} onChange={handleCustomFileUpload} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Raw Text Content</label>
                <textarea className="search-input" style={{ width: '100%', height: '150px', resize: 'vertical' }} placeholder="Paste document text here..." value={customDocText} onChange={e => setCustomDocText(e.target.value)}></textarea>
              </div>
              <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }} onClick={handleIngestCustomDoc}>
                ⚡ Parse & Audit Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registry Modal */}
      {showRegistryModal && (
        <div className="modal-overlay" onClick={() => setShowRegistryModal(false)}>
          <div className="modal-content" style={{ width: '800px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Document Knowledge Base Registry</h3>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowRegistryModal(false)}>✕</button>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <input type="text" className="search-input" placeholder="Search registry..." value={registrySearchQuery} onChange={e => setRegistrySearchQuery(e.target.value)} />
              <button className="btn btn-secondary" onClick={() => {
                const json = exportRegistryJSON();
                downloadFile(json, 'verimed-knowledge-base-backup.json', 'application/json');
              }}>📤 Export Base</button>
              <button className="btn btn-secondary" onClick={() => importFileInputRef.current.click()}>📥 Restore Base</button>
              <input type="file" style={{ display: 'none' }} accept=".json" ref={importFileInputRef} onChange={handleImportRegistry} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '6px' }}>
              {getFilteredRegistryDocs().length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>No medical documents match your search.</div>
              ) : (
                getFilteredRegistryDocs().map(doc => {
                  const stats = doc.structuredData?.summary?.stats || {};
                  const riskColor = stats.violations > 0 ? '#fb7185' : stats.advisories > 0 ? '#fbbf24' : '#34d399';
                  const dateFormatted = new Date(doc.addedAt || Date.now()).toLocaleString();
                  return (
                    <div key={doc.id} style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-card)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{doc.title}</span>
                          <span className="status-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--primary-cyan)', fontSize: '0.68rem' }}>{doc.category}</span>
                          <span className="status-badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: riskColor, fontSize: '0.68rem' }}>{stats.riskLevel || 'Audited'}</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                          Added: {dateFormatted} | {stats.totalLines || 0} Lines | {stats.wordCount || 0} Words
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => { setShowRegistryModal(false); handleLoadDocument(doc); }}>⚡ Load & Audit</button>
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} title="Download JSON" onClick={() => {
                          const json = exportToJSON(doc.title, doc.structuredData?.metadata ? { metadata: doc.structuredData.metadata, sections: doc.structuredData.sections, lines: parseDocumentText(doc.rawContent).lines } : parseDocumentText(doc.rawContent, doc.id), doc.structuredData?.summary || generateVerifiableSummary(parseDocumentText(doc.rawContent), runComplianceAudit(parseDocumentText(doc.rawContent))), doc.structuredData?.auditResults || runComplianceAudit(parseDocumentText(doc.rawContent)));
                          downloadFile(json, `${doc.id}-structured-schema.json`, 'application/json');
                        }}>📥 JSON</button>
                        {!doc.isSample && (
                          <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#fb7185' }} title="Delete Document" onClick={() => handleDeleteDoc(doc.id)}>🗑️</button>
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
                const md = exportToMarkdown(activeDocData.title, parsedDoc, summaryData, auditResults);
                downloadFile(md, `${activeDocData.id}-audit-report.md`, 'text/markdown');
                setShowExportModal(false);
              }}>⬇️ Download Markdown</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
