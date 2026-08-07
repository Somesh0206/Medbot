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
  
  // Page Routing State (home, stream, audit, summary, qa)
  const [activePage, setActivePage] = useState('home');
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

  // Mandatory Per-Session User Identity & Role States ('staff' | 'patient')
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('staff'); // 'staff' or 'patient'
  const [showNameModal, setShowNameModal] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);

  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);

  // Helper to append a user activity log entry
  const addLogEntry = (action, details, user = userName, role = userRole) => {
    if (typeof window === 'undefined') return;
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user: user || 'Anonymous User',
      role: role === 'staff' ? 'Hospital Staff' : 'Patient',
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
    // ALWAYS force name login prompt on every page reload / refresh / restart
    if (typeof window !== 'undefined') {
      const savedLogsRaw = localStorage.getItem('healio_user_logs');
      const existingLogs = savedLogsRaw ? JSON.parse(savedLogsRaw) : [];
      setActivityLogs(existingLogs);
      
      // Reset active user session to require fresh name login on reload
      setUserName('');
      setShowNameModal(true);
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
      alert('Please enter your name to log in to Healio.');
      return;
    }
    setUserName(trimmed);
    setShowNameModal(false);
    
    // Auto-adjust default registry view filter based on selected user role
    if (userRole === 'patient') {
      setRegistryFileFilter('patients');
    } else {
      setRegistryFileFilter('all');
    }

    addLogEntry('Session Started', `Logged in as ${userRole === 'staff' ? 'Hospital Staff' : 'Patient'}`, trimmed, userRole);
  };

  const handleChangeUserName = () => {
    const newName = prompt(`Enter your name for Healio session logs (${userRole === 'staff' ? 'Hospital Staff' : 'Patient'}):`, userName);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      setUserName(trimmed);
      addLogEntry('Identity Changed', `Switched active identity to "${trimmed}" (${userRole})`, trimmed, userRole);
    }
  };

  const handleSwitchRole = () => {
    setShowLogModal(false);
    setNameInput(userName);
    setShowNameModal(true);
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
    setActivePage('stream');
    setActiveHighlightLine(startLine);
    setTimeout(() => {
      const elem = document.getElementById(`doc-line-${startLine}`);
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
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
    setActivePage('audit');
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
      {/* App Header */}
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
          <button className="btn btn-secondary" style={{ borderColor: userRole === 'staff' ? 'var(--primary-cyan)' : 'var(--accent-emerald)', color: 'white' }} onClick={() => setShowLogModal(true)}>
            👤 {userRole === 'staff' ? '🏥 Staff' : '👤 Patient'}: <strong style={{ color: userRole === 'staff' ? 'var(--primary-cyan)' : '#34d399', marginLeft: '2px' }}>{userName || 'Guest'}</strong>
          </button>

          <button className="btn btn-secondary" onClick={() => setShowRegistryModal(true)}>
            📁 Registries: 📋 Patients ({patientDocsCount}) | 🏥 Policies ({policyDocsCount})
          </button>

          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            ➕ Insert Document
          </button>
        </div>
      </header>

      {/* Top Clean Navigation Bar */}
      <nav className="nav-bar">
        <div className="nav-container">
          <button className={`nav-link ${activePage === 'home' ? 'active' : ''}`} onClick={() => setActivePage('home')}>
            🏠 Home Overview
          </button>
          <button className={`nav-link ${activePage === 'stream' ? 'active' : ''}`} onClick={() => setActivePage('stream')}>
            📜 Document Reader ({parsedDoc?.metadata?.totalLines || 0} Lines)
          </button>
          <button className={`nav-link ${activePage === 'audit' ? 'active' : ''}`} onClick={() => setActivePage('audit')}>
            🛡️ Statutory Audit Matrix ({auditResults.length})
          </button>
          <button className={`nav-link ${activePage === 'summary' ? 'active' : ''}`} onClick={() => setActivePage('summary')}>
            📊 Executive Summary
          </button>
          <button className={`nav-link ${activePage === 'qa' ? 'active' : ''}`} onClick={() => setActivePage('qa')}>
            💬 Grounded Evidence Q&A ({dynamicQuestions.length})
          </button>
        </div>
      </nav>

      {/* Clean Page View Containers */}
      <main className="page-container">
        {/* Page 1: Home Landing Page */}
        {activePage === 'home' && (
          <div>
            <div className="healio-hero">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>✨ Healio Clinical AI Platform v2.0</span>
                {userName && (
                  <span className={`badge ${userRole === 'staff' ? 'badge-info' : 'badge-success'}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                    {userRole === 'staff' ? '🏥 Hospital Staff' : '👤 Patient'}: {userName}
                  </span>
                )}
              </div>
              <h1 className="healio-title">Healio</h1>
              <div className="healio-subtitle">Next-Generation Verifiable Clinical Intelligence & Medical Governance Studio</div>
              <p className="healio-description">
                Healio is an advanced clinical audit and governance platform designed for medical boards, hospital administrators, healthcare providers, and patients. It parses multi-format medical records and hospital policies (PDF, Word, Text, RTF, CSV, JSON, HTML) into line-indexed statutory audit matrices, grounded evidence Q&A engines, and dual-file document registries with 100% verifiable source line citations.
              </p>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setActivePage('audit')}>
                  🛡️ Launch Statutory Audit Matrix
                </button>
                <button className="btn btn-secondary" onClick={() => setActivePage('qa')}>
                  💬 Launch Grounded Q&A Assistant
                </button>
                <button className="btn btn-secondary" onClick={() => setActivePage('stream')}>
                  📜 View Document Stream
                </button>
              </div>
            </div>

            {/* Currently Active Document Quick Status */}
            {activeDocData && (
              <div className="clean-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--primary-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    CURRENTLY LOADED ACTIVE DOCUMENT
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                    📄 {activeDocData.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Category: {activeDocData.category} | File: {activeDocData.targetFile === 'patients' ? '📋 Patient Records' : '🏥 Hospital Policies'} | {parsedDoc?.metadata?.totalLines || 0} Lines Indexed
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-primary" onClick={() => setActivePage('stream')}>
                    📜 Read Document Lines
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowRegistryModal(true)}>
                    Switch Document 🔁
                  </button>
                </div>
              </div>
            )}

            {/* Core Functions Feature Grid */}
            <div style={{ marginBottom: '12px', marginTop: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white', fontSize: '1.2rem' }}>
                Healio Dedicated Function Workspaces ({userRole === 'staff' ? '🏥 Hospital Staff View' : '👤 Patient View'})
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Select any dedicated page below to perform clean, uncluttered medical governance workflows.
              </p>
            </div>

            <div className="feature-cards-grid">
              <div className="feature-card" onClick={() => setActivePage('stream')}>
                <div>
                  <div className="feature-icon">📜</div>
                  <div className="feature-card-title">Document Reader Stream</div>
                  <div className="feature-card-desc">
                    Clean, full-focus reader displaying line-by-line indexed text, line numbers, search filters, and section headers.
                  </div>
                </div>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                  Open Document Reader ➔
                </button>
              </div>

              <div className="feature-card" onClick={() => setActivePage('audit')}>
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

              <div className="feature-card" onClick={() => setActivePage('qa')}>
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

              <div className="feature-card" onClick={() => setActivePage('summary')}>
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
                  <div className="feature-card-title">Patient Records Registry</div>
                  <div className="feature-card-desc">
                    Manage patient clinical notes, EHR extracts, case hearing transcripts, and intake files stored in <code style={{ color: '#38bdf8' }}>patients_registry.json</code>.
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                  Manage Patient Files ({patientDocsCount}) ➔
                </button>
              </div>

              <div className="feature-card" onClick={() => { setRegistryFileFilter('policies'); setShowRegistryModal(true); }}>
                <div>
                  <div className="feature-icon">🏥</div>
                  <div className="feature-card-title">Hospital Policies Registry</div>
                  <div className="feature-card-desc">
                    Manage hospital SOPs, telemedicine protocols, surgical governance rules, and HIPAA directives stored in <code style={{ color: '#38bdf8' }}>policies_registry.json</code>.
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                  Manage Policy Files ({policyDocsCount}) ➔
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page 2: Dedicated Document Stream Reader */}
        {activePage === 'stream' && (
          <div className="document-stream-page">
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-heading)', color: 'white' }}>Indexed Document Reader Stream</h2>
                  <span className="badge badge-info">{parsedDoc?.metadata?.totalLines || 0} Lines</span>
                  {activeDocData?.title && (
                    <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                      📄 {activeDocData.title}
                    </span>
                  )}
                  {activeDocData?.targetFile && (
                    <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                      {activeDocData.targetFile === 'patients' ? '📋 Patient Records File' : '🏥 Hospital Policies File'}
                    </span>
                  )}
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setShowRegistryModal(true)}>
                  Switch Loaded Document 🔁
                </button>
              </div>

              <div style={{ width: '100%', marginTop: '6px' }}>
                <input 
                  type="text" 
                  className="search-input" 
                  style={{ width: '100%' }}
                  placeholder="Search verbatim lines or type line number in loaded document..." 
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="document-stream" style={{ padding: '8px 0' }}>
              {getFilteredLines().length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
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
                        gap: '12px',
                        padding: '8px 18px',
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
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: isHighlighted ? 'var(--primary-cyan)' : '#38bdf8',
                          background: 'rgba(6, 182, 212, 0.12)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          userSelect: 'none'
                        }}
                      >
                        #{line.lineNumber}
                      </span>
                      <span style={{ fontSize: '0.88rem', color: isHighlighted ? '#ffffff' : '#cbd5e1', lineHeight: 1.6, flex: 1, wordBreak: 'break-word' }}>
                        {line.section && (
                          <span className="section-tag" style={{ marginRight: '8px', fontSize: '0.75rem' }}>
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
        )}

        {/* Page 3: Statutory Audit Matrix */}
        {activePage === 'audit' && (
          <div className="clean-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)', color: 'white' }}>
                  Compliance & Statutory Rules Matrix
                </h2>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Automated audit findings for active document "{activeDocData?.title || 'Loaded Document'}" with verbatim line citations
                </span>
              </div>
              <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowExportModal(true)}>
                📤 Export Report
              </button>
            </div>

            <div className="audit-matrix-grid">
              {auditResults.map((rule) => {
                const statusClass = rule.status === 'VIOLATION' ? 'status-violation' : rule.status === 'ADVISORY' ? 'status-advisory' : 'status-compliant';
                const icon = rule.status === 'VIOLATION' ? '🚨' : rule.status === 'ADVISORY' ? '⚠️' : '✅';
                return (
                  <div key={rule.id} className="audit-card" style={{ padding: '20px' }}>
                    <div className="audit-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                        <strong style={{ fontSize: '1rem', color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>{rule.title}</strong>
                      </div>
                      <span className={`status-badge ${statusClass}`}>{rule.status}</span>
                    </div>
                    <p className="findings-text" style={{ fontSize: '0.9rem', marginBottom: '12px' }}>{rule.findings}</p>
                    
                    {rule.citation && (
                      <div style={{ marginBottom: '12px' }}>
                        <button className="citation-pill" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={() => jumpToLine(rule.citation.startLine, rule.citation.endLine)}>
                          📍 Jump to Verbatim Citation: Lines {rule.citation.startLine}–{rule.citation.endLine}
                        </button>
                        {rule.verbatimQuote && (
                          <div className="verbatim-quote" style={{ fontSize: '0.82rem', marginTop: '8px' }}>
                            "{rule.verbatimQuote}"
                          </div>
                        )}
                      </div>
                    )}

                    <div className="recommendation-box" style={{ fontSize: '0.85rem' }}>
                      💡 <strong>Actionable Recommendation:</strong> {rule.recommendation}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Page 4: Executive Summary */}
        {activePage === 'summary' && summaryData && (
          <div className="clean-card">
            <div style={{ marginBottom: '20px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '12px', padding: '16px 20px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--primary-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Executive Summary of Selected Document
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-heading)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📄 {activeDocData?.title || 'Loaded Document'}
                <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                  {activeDocData?.targetFile === 'patients' ? '📋 Patient Records File' : '🏥 Hospital Policies File'}
                </span>
              </div>
            </div>

            <div className="summary-stats-grid">
              <div className="stat-card">
                <span className="stat-label">Document Risk Level</span>
                <span className="stat-value" style={{ color: summaryData.stats.violations > 0 ? '#fb7185' : '#34d399', fontSize: '1.1rem' }}>
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
              <h4 style={{ color: 'var(--primary-cyan)', fontSize: '0.95rem', marginBottom: '8px', fontFamily: 'var(--font-heading)' }}>
                Executive Overview
              </h4>
              <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.65 }}>{summaryData.overview}</p>
            </div>

            <div className="summary-section">
              <h4 style={{ color: 'var(--primary-cyan)', fontSize: '0.95rem', marginBottom: '12px', fontFamily: 'var(--font-heading)' }}>
                Verifiable Compliance & Key Directives
              </h4>
              {summaryData.takeaways.map((takeaway, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', background: 'rgba(15, 23, 42, 0.4)', padding: '12px 16px', borderRadius: '8px', borderLeft: '3px solid var(--primary-cyan)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--primary-cyan)', fontWeight: 600 }}>[{takeaway.topic}]</div>
                    <div style={{ fontSize: '0.88rem', color: '#e2e8f0', marginTop: '4px' }}>"{takeaway.text}"</div>
                  </div>
                  <span className="citation-pill" style={{ cursor: 'pointer', whiteSpace: 'nowrap', padding: '4px 10px' }} onClick={() => jumpToLine(takeaway.citation.startLine)}>
                    Jump to Line {takeaway.citation.startLine}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>📤 Export Markdown</button>
              <button className="btn btn-secondary" onClick={() => {
                const json = exportToJSON(activeDocData.title, parsedDoc, summaryData, auditResults);
                downloadFile(json, `${activeDocData.id}-audit-data.json`, 'application/json');
              }}>📥 Download JSON</button>
            </div>
          </div>
        )}

        {/* Page 5: Grounded Evidence Q&A Workspace */}
        {activePage === 'qa' && (
          <div className="clean-card">
            <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: 'var(--primary-cyan)', fontWeight: 600 }}>
              💬 Grounded Q&A Workspace — Querying Loaded Document: <strong>"{activeDocData?.title || 'Loaded Document'}"</strong> ({parsedDoc?.metadata?.totalLines || 0} indexed lines)
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Suggested Questions generated for "{activeDocData?.title || 'Loaded Document'}":
            </div>

            <div className="suggested-prompts" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
              {dynamicQuestions.map((qText, idx) => (
                <span 
                  key={idx} 
                  className="prompt-chip" 
                  style={{ cursor: 'pointer', background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#e0f2fe', padding: '8px 16px', fontSize: '0.84rem' }}
                  onClick={() => { 
                    setQaQuery(qText); 
                    handleAskQuery(qText); 
                  }}
                >
                  💡 {qText}
                </span>
              ))}
            </div>

            <div className="query-input-box" style={{ marginBottom: '20px' }}>
              <input 
                type="text" 
                className="search-input" 
                style={{ padding: '12px 16px', fontSize: '0.95rem' }}
                placeholder={`Ask any question from loaded document "${activeDocData?.title || 'document'}"...`} 
                value={qaQuery}
                onChange={(e) => setQaQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskQuery(qaQuery)}
              />
              <button className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '0.95rem' }} onClick={() => handleAskQuery(qaQuery)}>Ask ✨</button>
            </div>

            {qaResponse ? (
              <div className="qa-response-card" style={{ padding: '24px' }}>
                <div className="response-header">
                  <strong style={{ fontFamily: 'var(--font-heading)', color: 'var(--primary-cyan)', fontSize: '1.05rem' }}>
                    Grounded Answer Verification
                  </strong>
                  <div className="confidence-indicator" style={{ fontSize: '0.9rem' }}>
                    <span>🛡️ {qaResponse.confidence}% Evidence Grounding</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.92rem', color: '#f8fafc', lineHeight: 1.65, marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
                  {qaResponse.answer}
                </div>
                {qaResponse.citation && (
                  <button className="citation-pill" style={{ marginBottom: '16px', padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => jumpToLine(qaResponse.citation.startLine, qaResponse.citation.endLine)}>
                    📍 Jump to Verbatim Citation in Document Stream (Lines {qaResponse.citation.startLine}-{qaResponse.citation.endLine})
                  </button>
                )}
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Verbatim Source Excerpts from Loaded Document:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {qaResponse.excerpts.map((e, idx) => (
                    <div key={idx} style={{ background: 'rgba(10, 15, 26, 0.7)', padding: '10px 14px', borderLeft: '3px solid var(--primary-cyan)', fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Line {e.lineNumber} ({e.section}): "{e.text}"
                    </div>
                  ))}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Verification Chain of Thought:
                </div>
                <ul className="reasoning-list" style={{ fontSize: '0.84rem' }}>
                  {qaResponse.reasoning.map((r, idx) => <li key={idx} style={{ marginBottom: '4px' }}>{r}</li>)}
                </ul>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '60px 20px', fontSize: '0.92rem' }}>
                💬 Select any of the loaded document questions above or type a custom query to get grounded answers with verbatim line citations.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mandatory Per-Session User Identity & Role Selection Login Modal */}
      {showNameModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', width: '520px' }}>
            <div className="brand-logo" style={{ margin: '0 auto 12px auto', width: '48px', height: '48px', fontSize: '1.4rem' }}>H</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'white', fontSize: '1.4rem', marginBottom: '4px' }}>Welcome to Healio</h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Please select your role and enter your name to log in to Healio.
            </p>

            {/* Role Selection Options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
              <div 
                style={{
                  background: userRole === 'staff' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                  border: userRole === 'staff' ? '2px solid var(--primary-cyan)' : '1px solid var(--border-card)',
                  borderRadius: '12px',
                  padding: '14px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center'
                }}
                onClick={() => setUserRole('staff')}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🏥</div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'white', fontFamily: 'var(--font-heading)' }}>Hospital Staff</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Clinician, Auditor, Admin</div>
              </div>

              <div 
                style={{
                  background: userRole === 'patient' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                  border: userRole === 'patient' ? '2px solid var(--accent-emerald)' : '1px solid var(--border-card)',
                  borderRadius: '12px',
                  padding: '14px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center'
                }}
                onClick={() => setUserRole('patient')}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>👤</div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'white', fontFamily: 'var(--font-heading)' }}>Patient</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Patient, Caregiver, User</div>
              </div>
            </div>

            <input 
              type="text" 
              className="search-input" 
              style={{ width: '100%', padding: '12px', fontSize: '1rem', textAlign: 'center', marginBottom: '16px' }} 
              placeholder={userRole === 'staff' ? 'e.g. Dr. Somesh / Auditor Jane Doe' : 'e.g. Patient John Smith'} 
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveUserName()}
              autoFocus
            />
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.95rem' }} onClick={handleSaveUserName}>
              Login as {userRole === 'staff' ? '🏥 Hospital Staff' : '👤 Patient'} ➔
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

            <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary-cyan)', fontWeight: 600 }}>ACTIVE SESSION USER IDENTITY</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', fontFamily: 'var(--font-heading)' }}>
                  {userRole === 'staff' ? '🏥 Staff: ' : '👤 Patient: '} {userName || 'Guest User'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={handleChangeUserName}>
                  ✏️ Change Name
                </button>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={handleSwitchRole}>
                  🔄 Switch Role & Login
                </button>
              </div>
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
                        <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>👤 {log.user} ({log.role || 'Staff'})</span>
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
