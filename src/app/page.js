"use client";
import React, { useState, useEffect, useRef } from 'react';
import { SAMPLE_DOCUMENTS } from '@/lib/sampleData';
import { parseDocumentText } from '@/lib/parser';
import { runComplianceAudit } from '@/lib/auditEngine';
import { generateVerifiableSummary } from '@/lib/summaryEngine';
import { answerGroundedQuery, generateDocumentQuestions } from '@/lib/qaEngine';
import { exportToMarkdown, exportToJSON, downloadFile } from '@/lib/exportUtils';
import {
  getStoredDocuments,
  saveDocumentToRegistry,
  deleteDocumentFromRegistry,
  exportRegistryFileJSON,
  importRegistryFileJSON
} from '@/lib/storageEngine';
import { extractTextFromFile } from '@/lib/fileExtractor';

export default function HealioApp() {
  const [allDocs, setAllDocs] = useState([]);
  const [activeDocData, setActiveDocData] = useState(null);
  const [parsedDoc, setParsedDoc] = useState(null);
  const [auditResults, setAuditResults] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [activeHighlightLine, setActiveHighlightLine] = useState(null);
  
  const [activeTab, setActiveTab] = useState('home'); // home, audit, summary, qa
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
  const [isExtractingFile, setIsExtractingFile] = useState(false);

  // Mandatory User Identity & Log States
  const [userName, setUserName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);

  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);

  // Helper to append a user activity log entry
  const addLogEntry = (action, details, user = userName) => {
    if (typeof window === 'undefined') return;
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user: user || 'Anonymous User',
      action,
      details,
      timestamp: new Date().toISOString()
    };
    setActivityLogs((prevLogs) => {
      const updated = [entry, ...prevLogs];
      try {
        localStorage.setItem('healio_user_logs', JSON.stringify(updated.slice(0, 100)));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  useEffect(() => {
    // Check saved user identity
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('healio_user_name');
      const savedLogsRaw = localStorage.getItem('healio_user_logs');
      const existingLogs = savedLogsRaw ? JSON.parse(savedLogsRaw) : [];
      setActivityLogs(existingLogs);

      if (savedUser && savedUser.trim()) {
        setUserName(savedUser.trim());
      } else {
        setShowNameModal(true);
      }
    }

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
      handleLoadDocument(stored[0], false);
    }
  }, []);

  const handleSaveUserName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      alert('Please enter your name to access Healio.');
      return;
    }
    setUserName(trimmed);
    localStorage.setItem('healio_user_name', trimmed);
    setShowNameModal(false);
    addLogEntry('Session Started', 'Logged into Healio Platform', trimmed);
  };

  const handleChangeUserName = () => {
    const newName = prompt('Enter your name for Healio session logs:', userName);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      setUserName(trimmed);
      localStorage.setItem('healio_user_name', trimmed);
      addLogEntry('Identity Changed', `Switched active user identity to "${trimmed}"`, trimmed);
    }
  };

  const reloadAllDocs = (filter = registryFileFilter) => {
    const updated = getStoredDocuments(filter);
    setAllDocs(updated);
  };

  const handleLoadDocument = (docData, logAction = true) => {
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

    if (logAction) {
      addLogEntry('Loaded & Audited Document', `Loaded "${docData.title}" (${docData.targetFile === 'patients' ? 'Patient File' : 'Policies File'})`);
    }

    // Scroll Indexed Document Stream to top when new PDF/document is loaded
    setTimeout(() => {
      const streamContainer = document.querySelector('.document-stream');
      if (streamContainer) {
        streamContainer.scrollTop = 0;
      }
    }, 50);
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
    addLogEntry('Asked Grounded Query', `Query: "${query.trim()}" on "${activeDocData?.title || 'Document'}"`);
  };

  const handleDeleteDoc = (id, targetFile) => {
    if (confirm("Are you sure you want to remove this document from the registry file?")) {
      deleteDocumentFromRegistry(id, targetFile);
      const updatedDocs = getStoredDocuments(registryFileFilter);
      setAllDocs(updatedDocs);
      addLogEntry('Deleted Document', `Removed document ID ${id} from ${targetFile} registry`);
      if (activeDocData?.id === id && updatedDocs.length > 0) {
        handleLoadDocument(updatedDocs[0]);
      }
    }
  };

  const handleInsertCustomDoc = () => {
    const title = customDocTitle.trim() || 'Custom Inserted Medical Document';
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
      description: `Inserted ${new Date().toLocaleDateString()} — ${parsed.metadata.totalLines} lines (${customTargetFile === 'patients' ? 'Patient Record' : 'Hospital Policy'})`,
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
    addLogEntry('Inserted New Document', `Inserted "${title}" into ${customTargetFile === 'patients' ? 'Patient Records File' : 'Hospital Policies File'}`);
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
        addLogEntry('Imported Registry JSON', `Restored ${count} files into ${targetFile} registry`);
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

  const patientDocsCount = getStoredDocuments('patients').length;
  const policyDocsCount = getStoredDocuments('policies').length;
  const dynamicQuestions = generateDocumentQuestions(parsedDoc, activeDocData);

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="brand-container">
          <div className="brand-logo">H</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="brand-title">Healio</h1>
              <span className="brand-badge">Clinical AI</span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Verifiable Medical & Governance Compliance Engine</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* User Identity & Log Button */}
          <button className="btn btn-secondary" style={{ borderColor: 'var(--primary-cyan)', color: 'white' }} onClick={() => setShowLogModal(true)}>
            👤 User Log: <strong style={{ color: 'var(--primary-cyan)', marginLeft: '2px' }}>{userName || 'Guest'}</strong>
          </button>

          <button className="btn btn-secondary" onClick={() => setShowRegistryModal(true)}>
            📁 Registries: 📋 Patients ({patientDocsCount}) | 🏥 Policies ({policyDocsCount})
          </button>

          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            ➕ Insert Document
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="main-layout">
        {/* Left Panel: Document Viewer (Indexed Document Stream) */}
        <div className="left-panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)' }}>Indexed Document Stream</h2>
                <span className="badge badge-info">{parsedDoc?.metadata?.totalLines || 0} Lines</span>
                {activeDocData?.title && (
                  <span className="badge badge-success" style={{ fontSize: '0.68rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeDocData.title}>
                    📄 {activeDocData.title}
                  </span>
                )}
                {activeDocData?.targetFile && (
                  <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>
                    {activeDocData.targetFile === 'patients' ? '📋 Patients File' : '🏥 Policies File'}
                  </span>
                )}
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.72rem' }} onClick={() => setShowRegistryModal(true)}>Switch Document 🔁</button>
            </div>
            <div style={{ width: '100%' }}>
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search indexed verbatim lines in loaded document..." 
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

        {/* Right Panel: Healio Functional Module Suite */}
        <div className="right-panel">
          <div className="panel-tabs">
            <button className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
              🏠 Home
            </button>
            <button className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
              🛡️ Audit Matrix ({auditResults.length})
            </button>
            <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
              📊 Executive Summary
            </button>
            <button className={`tab-btn ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>
              💬 Grounded Q&A ({dynamicQuestions.length})
            </button>
            <button className={`tab-btn ${activeTab === 'patients_view' ? 'active' : ''}`} onClick={() => { setRegistryFileFilter('patients'); setShowRegistryModal(true); }}>
              📋 Patient Records ({patientDocsCount})
            </button>
            <button className={`tab-btn ${activeTab === 'policies_view' ? 'active' : ''}`} onClick={() => { setRegistryFileFilter('policies'); setShowRegistryModal(true); }}>
              🏥 Hospital Policies ({policyDocsCount})
            </button>
          </div>

          <div className="tab-content">
            {/* Healio Home Landing View */}
            {activeTab === 'home' && (
              <div>
                {/* Hero Section */}
                <div className="healio-hero">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>✨ Healio Clinical AI Platform v2.0</span>
                    {userName && (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                        👤 Logged in as: {userName}
                      </span>
                    )}
                  </div>
                  <h1 className="healio-title">Healio</h1>
                  <div className="healio-subtitle">Next-Generation Verifiable Clinical Intelligence & Medical Governance Studio</div>
                  <p className="healio-description">
                    Healio is an advanced clinical audit and governance platform designed for medical boards, hospital administrators, healthcare providers, and clinical auditors. It parses multi-format medical records and hospital policies (PDF, Word, Text, RTF, CSV, JSON, HTML) into line-indexed statutory audit matrices, grounded evidence Q&A engines, and dual-file document registries with 100% verifiable source line citations.
                  </p>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => setActiveTab('audit')}>
                      🛡️ Launch Statutory Audit Matrix
                    </button>
                    <button className="btn btn-secondary" onClick={() => setActiveTab('qa')}>
                      💬 Launch Grounded Q&A Assistant
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowLogModal(true)}>
                      📜 View User Activity Log
                    </button>
                  </div>
                </div>

                {/* Core Functions Grid */}
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white', fontSize: '1.1rem' }}>
                    Healio Core Functions & Capabilities
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Select any function card below to perform specific medical governance and clinical analysis workflows.
                  </p>
                </div>

                <div className="feature-cards-grid">
                  <div className="feature-card" onClick={() => setActiveTab('audit')}>
                    <div>
                      <div className="feature-icon">🛡️</div>
                      <div className="feature-card-title">Statutory Audit Matrix</div>
                      <div className="feature-card-desc">
                        Automated compliance scanning against State Medical Board rules, PA supervision ratios, PDMP lookups, and HIPAA rules with line citations.
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                      Open Audit Matrix ➔
                    </button>
                  </div>

                  <div className="feature-card" onClick={() => setActiveTab('qa')}>
                    <div>
                      <div className="feature-icon">💬</div>
                      <div className="feature-card-title">Grounded Evidence Q&A</div>
                      <div className="feature-card-desc">
                        Ask any clinical, operational, or policy questions answered strictly using verbatim source lines from your loaded document with jump links.
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                      Open Grounded Q&A ➔
                    </button>
                  </div>

                  <div className="feature-card" onClick={() => setActiveTab('summary')}>
                    <div>
                      <div className="feature-icon">📊</div>
                      <div className="feature-card-title">Executive Summary</div>
                      <div className="feature-card-desc">
                        Structured overview of the loaded document, compliance scores, risk level breakdowns, and verifiable line-cited takeaways.
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                      View Executive Summary ➔
                    </button>
                  </div>

                  <div className="feature-card" onClick={() => { setRegistryFileFilter('patients'); setShowRegistryModal(true); }}>
                    <div>
                      <div className="feature-icon">📋</div>
                      <div className="feature-card-title">Patient Records File</div>
                      <div className="feature-card-desc">
                        Manage patient clinical notes, EHR extracts, case hearing transcripts, and intake files stored in <code style={{ color: '#38bdf8' }}>patients_registry.json</code>.
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                      Manage Patient Records ({patientDocsCount}) ➔
                    </button>
                  </div>

                  <div className="feature-card" onClick={() => { setRegistryFileFilter('policies'); setShowRegistryModal(true); }}>
                    <div>
                      <div className="feature-icon">🏥</div>
                      <div className="feature-card-title">Hospital Policies File</div>
                      <div className="feature-card-desc">
                        Manage hospital SOPs, telemedicine protocols, surgical governance rules, and HIPAA directives stored in <code style={{ color: '#38bdf8' }}>policies_registry.json</code>.
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                      Manage Hospital Policies ({policyDocsCount}) ➔
                    </button>
                  </div>

                  <div className="feature-card" onClick={() => setShowLogModal(true)}>
                    <div>
                      <div className="feature-icon">📜</div>
                      <div className="feature-card-title">User Audit & Activity Log</div>
                      <div className="feature-card-desc">
                        View active user session details for <strong style={{ color: 'var(--primary-cyan)' }}>{userName || 'User'}</strong> and full audit trail of documents loaded, inserted, and queried.
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                      View User Log ➔
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)', color: 'var(--text-main)' }}>
                      Compliance & Statutory Rules Matrix
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Automated audit findings for "{activeDocData?.title || 'Loaded Document'}" with verbatim line citations
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
                {/* Active Selected Document Banner */}
                <div style={{ marginBottom: '16px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '8px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Executive Summary of Selected Document
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-heading)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📄 {activeDocData?.title || 'Loaded Document'}
                    <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>
                      {activeDocData?.targetFile === 'patients' ? '📋 Patient Records File' : '🏥 Hospital Policies File'}
                    </span>
                  </div>
                </div>

                <div className="summary-stats-grid">
                  <div className="stat-card">
                    <span className="stat-label">Document Risk Level</span>
                    <span className="stat-value" style={{ color: summaryData.stats.violations > 0 ? '#fb7185' : '#34d399', fontSize: '1.05rem' }}>
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
                    Verifiable Compliance & Key Directives
                  </h4>
                  {summaryData.takeaways.map((takeaway, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px', background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--primary-cyan)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--primary-cyan)', fontWeight: 600 }}>[{takeaway.topic}]</div>
                        <div style={{ fontSize: '0.84rem', color: '#e2e8f0', marginTop: '2px' }}>"{takeaway.text}"</div>
                      </div>
                      <span className="citation-pill" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => jumpToLine(takeaway.citation.startLine)}>
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
                  💬 Document Q&A Assistant — Querying Loaded Document: <strong>"{activeDocData?.title || 'Loaded Document'}"</strong> ({parsedDoc?.metadata?.totalLines || 0} indexed lines)
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Questions relevant to "{activeDocData?.title || 'Loaded Document'}":
                </div>

                <div className="suggested-prompts" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                  {dynamicQuestions.map((qText, idx) => (
                    <span 
                      key={idx} 
                      className="prompt-chip" 
                      style={{ cursor: 'pointer', background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#e0f2fe' }}
                      onClick={() => { 
                        setQaQuery(qText); 
                        handleAskQuery(qText); 
                      }}
                    >
                      💡 {qText}
                    </span>
                  ))}
                </div>

                <div className="query-input-box">
                  <input 
                    type="text" 
                    className="search-input" 
                    placeholder={`Ask any question from loaded document "${activeDocData?.title || 'document'}"...`} 
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
                      Verbatim Source Excerpts from Loaded Document:
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
                    💬 Select any of the loaded document questions above or type a custom query to get grounded answers with verbatim line citations.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory User Name Entry Modal */}
      {showNameModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', width: '480px' }}>
            <div className="brand-logo" style={{ margin: '0 auto 12px auto', width: '48px', height: '48px', fontSize: '1.4rem' }}>H</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'white', fontSize: '1.4rem', marginBottom: '6px' }}>Welcome to Healio</h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Please enter your full name or title to access the Clinical AI & Governance Studio. Your name will be attached to session audit logs.
            </p>
            <input 
              type="text" 
              className="search-input" 
              style={{ width: '100%', padding: '12px', fontSize: '1rem', textAlign: 'center', marginBottom: '16px' }} 
              placeholder="e.g. Dr. Somesh / Auditor Jane Doe" 
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveUserName()}
              autoFocus
            />
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '0.95rem' }} onClick={handleSaveUserName}>
              Enter Healio Platform ➔
            </button>
          </div>
        </div>
      )}

      {/* User Activity Log Modal */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal-content" style={{ width: '750px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>👤 User Session & Activity Log</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Audit trail of document insertions, audits, and queries</span>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowLogModal(false)}>✕</button>
            </div>

            <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary-cyan)', fontWeight: 600 }}>ACTIVE USER IDENTITY</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', fontFamily: 'var(--font-heading)' }}>👤 {userName || 'Guest User'}</div>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={handleChangeUserName}>
                ✏️ Change Name
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
              {activityLogs.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No user activity recorded yet in this session.</div>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary-cyan)', fontSize: '0.85rem' }}>{log.action}</span>
                        <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>👤 {log.user}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{log.details}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem', color: '#fb7185' }} onClick={() => {
                if (confirm('Clear all session user logs?')) {
                  setActivityLogs([]);
                  localStorage.removeItem('healio_user_logs');
                }
              }}>🗑️ Clear Activity Logs</button>
              <button className="btn btn-primary" onClick={() => setShowLogModal(false)}>Close Log</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload/Insert Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Insert Medical Document into Healio</h3>
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
              <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }} onClick={handleInsertCustomDoc}>
                ⚡ Insert into {customTargetFile === 'patients' ? 'Patient Records File' : 'Hospital Policies File'} & Audit
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
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Healio Document Knowledge Registries</h3>
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
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>Export Verifiable Report from Healio</h3>
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
