"use client";
import React, { useState, useEffect, useRef } from 'react';
import { SAMPLE_DOCUMENTS, SAMPLE_FACILITIES } from '@/lib/sampleData';
import { GOVT_HEALTH_HELPLINES } from '@/lib/helplinesData';
import { parseDocumentText } from '@/lib/parser';
import { runComplianceAudit } from '@/lib/auditEngine';
import { generateVerifiableSummary } from '@/lib/summaryEngine';
import { answerGroundedQuery, generateDocumentQuestions, synthesizeMedicalQuerySummary } from '@/lib/qaEngine';

import { exportToMarkdown, downloadFile } from '@/lib/exportUtils';
import {
  getStoredDocuments,
  saveDocumentToRegistry,
  deleteDocumentFromRegistry,
  getStoredFacilities,
  saveFacilityToRegistry,
  deleteFacilityFromRegistry,
  exportFacilitiesJSON
} from '@/lib/storageEngine';
import { extractTextFromFile } from '@/lib/fileExtractor';
import { splitDualDocument } from '@/lib/docDivider';


export default function HealioApp() {
  const [allDocs, setAllDocs] = useState([]);
  const [activeDocData, setActiveDocData] = useState(null);
  const [parsedDoc, setParsedDoc] = useState(null);
  const [auditResults, setAuditResults] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [activeHighlightLine, setActiveHighlightLine] = useState(null);
  
  // Page Routing State (home, stream, audit, summary, qa, helplines)
  const [activePage, setActivePage] = useState('home');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [qaQuery, setQaQuery] = useState('');
  const [qaResponse, setQaResponse] = useState(null);

  // Government Helplines Search & Category Filters
  const [helplineSearch, setHelplineSearch] = useState('');
  const [helplineCategoryFilter, setHelplineCategoryFilter] = useState('All');
  
  const [showRegistryModal, setShowRegistryModal] = useState(false);
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [registryFileFilter, setRegistryFileFilter] = useState('all'); // all, patients, policies
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [customDocTitle, setCustomDocTitle] = useState('');
  const [customDocCategory, setCustomDocCategory] = useState('General');
  const [customTargetFile, setCustomTargetFile] = useState('auto'); // auto, patients, policies
  const [customDocText, setCustomDocText] = useState('');
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  // Medical Query Bot State
  const [botSearchInput, setBotSearchInput] = useState('');
  const [botQueryResult, setBotQueryResult] = useState(null);
  const [isBotSearching, setIsBotSearching] = useState(false);
  const [botQueryHistory, setBotQueryHistory] = useState([]);
  const [useGeminiMode, setUseGeminiMode] = useState(false);




  // Affiliated Hospital Facilities State
  const [facilities, setFacilities] = useState([]);
  const [facilitySearch, setFacilitySearch] = useState('');
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [newFacilityType, setNewFacilityType] = useState('Tertiary Care Hospital');
  const [newFacilityAccreditation, setNewFacilityAccreditation] = useState('');
  const [newFacilityLocation, setNewFacilityLocation] = useState('');
  const [newFacilityContact, setNewFacilityContact] = useState('');
  const [newFacilityEmail, setNewFacilityEmail] = useState('');
  const [newFacilityPhysicians, setNewFacilityPhysicians] = useState('25');
  const [newFacilityPaCap, setNewFacilityPaCap] = useState('1:4 (4 PAs per Supervising Physician)');
  const [newFacilityServices, setNewFacilityServices] = useState('Telemedicine, Emergency Care, PDMP Integrated');


  // Mandatory Per-Session User Identity & Role States ('staff' | 'patient')
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('staff'); // 'staff' or 'patient'
  const [showNameModal, setShowNameModal] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);

  const fileInputRef = useRef(null);

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
      setPasswordInput('');
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

    // Initialize facilities registry with sample data if empty
    let storedFacilities = getStoredFacilities();
    if (storedFacilities.length === 0) {
      SAMPLE_FACILITIES.forEach((fac) => saveFacilityToRegistry(fac));
      storedFacilities = getStoredFacilities();
    }
    setFacilities(storedFacilities.length > 0 ? storedFacilities : SAMPLE_FACILITIES);
  }, []);


  const handleSaveUserName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      alert('Please enter your name to log in to Healio.');
      return;
    }

    // Staff Password Verification: Hospital Staff MUST enter password 'admin'
    if (userRole === 'staff') {
      if (passwordInput.trim() !== 'admin') {
        alert('❌ Incorrect Hospital Staff Password! Please enter valid staff credentials (admin).');
        return;
      }
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
    // Only allow Hospital Staff to switch roles
    if (userRole !== 'staff') {
      alert('🔒 Patients are not permitted to switch roles. Please re-authenticate as Hospital Staff upon fresh login.');
      return;
    }
    setShowLogModal(false);
    setNameInput(userName);
    setPasswordInput('');
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

    const dualResult = splitDualDocument(text, title);

    if (customTargetFile === 'auto' || dualResult.containsDual) {
      if (dualResult.containsDual) {
        // Create Patient Record Document
        const patientDocId = `custom-patient-${Date.now()}`;
        const patientParsed = parseDocumentText(dualResult.patientContent, patientDocId);
        const patientAudit = runComplianceAudit(patientParsed);
        const patientSummary = generateVerifiableSummary(patientParsed, patientAudit);
        const patientDocRecord = {
          id: patientDocId,
          title: dualResult.patientTitle,
          category: 'Patient Records',
          targetFile: 'patients',
          description: `Extracted Patient Record — ${patientParsed.metadata.totalLines} lines`,
          addedAt: new Date().toISOString(),
          rawContent: dualResult.patientContent,
          isSample: false,
          structuredData: {
            metadata: patientParsed.metadata,
            sections: patientParsed.sections,
            summary: patientSummary,
            auditResults: patientAudit
          }
        };

        // Create Hospital Policy Document
        const policyDocId = `custom-policy-${Date.now()}`;
        const policyParsed = parseDocumentText(dualResult.policyContent, policyDocId);
        const policyAudit = runComplianceAudit(policyParsed);
        const policySummary = generateVerifiableSummary(policyParsed, policyAudit);
        const policyDocRecord = {
          id: policyDocId,
          title: dualResult.policyTitle,
          category: 'Regulatory Compliance',
          targetFile: 'policies',
          description: `Extracted Hospital Policy — ${policyParsed.metadata.totalLines} lines`,
          addedAt: new Date().toISOString(),
          rawContent: dualResult.policyContent,
          isSample: false,
          structuredData: {
            metadata: policyParsed.metadata,
            sections: policyParsed.sections,
            summary: policySummary,
            auditResults: policyAudit
          }
        };

        // Save both records to their respective registry files!
        saveDocumentToRegistry(patientDocRecord, 'patients');
        saveDocumentToRegistry(policyDocRecord, 'policies');
        reloadAllDocs();
        setShowUploadModal(false);
        setCustomDocText('');
        setCustomDocTitle('');

        alert(`✨ Dual Document Auto-Separation Complete!\n\nDetected both Patient Records and Hospital Policies in submitted file.\n\n1. 📋 Stored in Patient Records Registry: "${dualResult.patientTitle}" (${dualResult.summaryStats.patientLinesCount} lines)\n2. 🏥 Stored in Hospital Policies Registry: "${dualResult.policyTitle}" (${dualResult.summaryStats.policyLinesCount} lines)`);

        addLogEntry('Auto-Split Dual Document', `Separated "${title}" into Patient Records Registry and Hospital Policies Registry`);
        handleLoadDocument(patientDocRecord);
        setActivePage('audit');
        return;
      }
    }

    // Single document fallback if auto selected but no dual content, or if user explicitly chose single target
    const targetFile = customTargetFile === 'auto' ? 'policies' : customTargetFile;
    const docId = `custom-doc-${Date.now()}`;
    const parsed = parseDocumentText(text, docId);
    const audit = runComplianceAudit(parsed);
    const summary = generateVerifiableSummary(parsed, audit);
    const docRecord = {
      id: docId,
      title,
      category: customDocCategory,
      targetFile,
      description: `Inserted ${new Date().toLocaleDateString()} — ${parsed.metadata.totalLines} lines (${targetFile === 'patients' ? 'Patient Record' : 'Hospital Policy'})`,
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
    saveDocumentToRegistry(docRecord, targetFile);
    reloadAllDocs();
    setShowUploadModal(false);
    setCustomDocText('');
    setCustomDocTitle('');
    addLogEntry('Inserted New Document', `Inserted "${title}" into ${targetFile === 'patients' ? 'Patient Records File' : 'Hospital Policies File'}`);
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

  const handleRegisterFacility = () => {
    const name = newFacilityName.trim();
    if (!name) {
      alert('Please enter the Hospital Facility Name.');
      return;
    }

    const facilityId = `fac-${Date.now()}`;
    const servicesList = newFacilityServices
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const facilityRecord = {
      id: facilityId,
      name,
      type: newFacilityType,
      accreditationId: newFacilityAccreditation.trim() || `ACC-${Math.floor(100000 + Math.random() * 900000)}`,
      location: newFacilityLocation.trim() || 'Health Science District',
      emergencyContact: newFacilityContact.trim() || '+1 (800) 555-0199',
      email: newFacilityEmail.trim() || 'admin@hospital.org',
      physicianCount: parseInt(newFacilityPhysicians, 10) || 10,
      paRatioCap: newFacilityPaCap,
      complianceStatus: 'HIPAA & Statutory Compliant',
      services: servicesList.length > 0 ? servicesList : ['General Healthcare', 'Emergency Protocol'],
      registeredAt: new Date().toISOString()
    };

    saveFacilityToRegistry(facilityRecord);
    const updated = getStoredFacilities();
    setFacilities(updated);
    setShowFacilityModal(false);

    setNewFacilityName('');
    setNewFacilityAccreditation('');
    setNewFacilityLocation('');
    setNewFacilityContact('');
    setNewFacilityEmail('');

    alert(`🏥 Facility Registered Successfully!\n\n"${name}" has been registered and stored in the Affiliated Facilities Registry (facilities_registry.json).`);
    addLogEntry('Registered Hospital Facility', `Registered "${name}" (${facilityRecord.type}) under Affiliated Facilities`);
  };

  const handleDeleteFacility = (id, name) => {
    if (confirm(`Are you sure you want to remove hospital facility "${name}" from the registry?`)) {
      deleteFacilityFromRegistry(id);
      const updated = getStoredFacilities();
      setFacilities(updated);
      addLogEntry('Deleted Hospital Facility', `Removed facility "${name}" (ID: ${id}) from Affiliated Facilities`);
    }
  };

  const getFilteredFacilities = () => {
    const term = facilitySearch.toLowerCase().trim();
    if (!term) return facilities;
    return facilities.filter(f =>
      f.name.toLowerCase().includes(term) ||
      f.type.toLowerCase().includes(term) ||
      f.accreditationId.toLowerCase().includes(term) ||
      f.location.toLowerCase().includes(term) ||
      (f.services && f.services.some(s => s.toLowerCase().includes(term)))
    );
  };

  const handleTriggerEmergency = () => {
    setShowEmergencyModal(true);
    addLogEntry('Triggered Emergency SOS Call', 'Opened 112 Medical Emergency Call Dispatch Portal');
  };

  const handleExecuteBotQuery = async (queryToSearch, forceGeminiOverride) => {
    const term = (queryToSearch || botSearchInput).trim();
    if (!term) return;

    const isGemini = typeof forceGeminiOverride === 'boolean' ? forceGeminiOverride : useGeminiMode;

    setIsBotSearching(true);
    try {
      const summaryPayload = await synthesizeMedicalQuerySummary(term, allDocs, parsedDoc, isGemini);
      setBotQueryResult(summaryPayload);
      setBotQueryHistory(prev => {
        const filtered = prev.filter(q => q.toLowerCase() !== term.toLowerCase());
        return [term, ...filtered].slice(0, 8);
      });
      addLogEntry('Executed Medical Query Bot Search', `Query: "${term}" — Source: ${summaryPayload.source || 'Medical AI'} (${summaryPayload.confidence}%)`);
    } catch (err) {
      console.error('Bot query execution error:', err);
    } finally {
      setIsBotSearching(false);
    }
  };

  useEffect(() => {
    if (activePage === 'querybot' && !botQueryResult && !isBotSearching) {
      handleExecuteBotQuery('What are the mandatory PDMP lookup & narcotic checking rules?');
    }
  }, [activePage]);






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

  const getFilteredHelplines = () => {
    let lines = GOVT_HEALTH_HELPLINES;
    if (helplineCategoryFilter !== 'All') {
      lines = lines.filter(h => h.category === helplineCategoryFilter);
    }
    const term = helplineSearch.toLowerCase().trim();
    if (term) {
      lines = lines.filter(h => 
        h.name.toLowerCase().includes(term) ||
        h.number.toLowerCase().includes(term) ||
        h.agency.toLowerCase().includes(term) ||
        h.description.toLowerCase().includes(term)
      );
    }
    return lines;
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
          {/* User Identity & Log Button: Only Hospital Staff can open full user logs */}
          <button 
            className="btn btn-secondary" 
            style={{ borderColor: userRole === 'staff' ? 'var(--primary-cyan)' : 'var(--accent-emerald)', color: 'white' }} 
            onClick={() => setShowLogModal(true)}
          >
            👤 {userRole === 'staff' ? '🏥 Staff Log' : '👤 Patient'}: <strong style={{ color: userRole === 'staff' ? 'var(--primary-cyan)' : '#34d399', marginLeft: '2px' }}>{userName || 'Guest'}</strong>
          </button>

          <button className="btn btn-secondary" onClick={() => setShowRegistryModal(true)}>
            📁 Registries: 📋 Patients ({patientDocsCount}) | 🏥 Policies ({policyDocsCount})
          </button>

          <button className="btn btn-secondary" style={{ borderColor: 'var(--primary-cyan)', color: 'white' }} onClick={() => setActivePage('facilities')}>
            🏢 Facilities ({facilities.length})
          </button>

          <button className="btn btn-secondary" style={{ borderColor: '#818cf8', color: '#a5b4fc' }} onClick={() => setActivePage('querybot')}>
            🤖 Query Bot
          </button>

          <button 
            className="btn" 
            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', color: 'white', fontWeight: 800, border: '1px solid #f87171', boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)' }} 
            onClick={handleTriggerEmergency}
          >
            🚨 SOS 112 Call
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
          <button className={`nav-link ${activePage === 'helplines' ? 'active' : ''}`} onClick={() => setActivePage('helplines')}>
            📞 Govt Health Lines ({GOVT_HEALTH_HELPLINES.length})
          </button>
          <button className={`nav-link ${activePage === 'facilities' ? 'active' : ''}`} onClick={() => setActivePage('facilities')}>
            🏢 Affiliated Facilities ({facilities.length})
          </button>
          <button className={`nav-link ${activePage === 'querybot' ? 'active' : ''}`} onClick={() => setActivePage('querybot')}>
            🤖 Medical Query Bot
          </button>
          <button 
            className="nav-link" 
            style={{ color: '#f87171', fontWeight: 700 }} 
            onClick={handleTriggerEmergency}
          >
            🚨 Emergency Call 112
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
                Healio is an advanced clinical audit and governance platform designed for medical boards, hospital administrators, healthcare providers, and patients. It parses multi-format medical records and hospital policies (PDF, Word, Text, RTF, CSV, HTML) into line-indexed statutory audit matrices, grounded evidence Q&A engines, dual-file document registries, and official government health helplines directories.
              </p>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setActivePage('audit')}>
                  🛡️ Launch Statutory Audit Matrix
                </button>
                <button className="btn btn-secondary" onClick={() => setActivePage('qa')}>
                  💬 Launch Grounded Q&A Assistant
                </button>
                <button className="btn btn-secondary" onClick={() => setActivePage('helplines')}>
                  📞 Government Emergency Helplines
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

              <div className="feature-card" onClick={() => setActivePage('helplines')}>
                <div>
                  <div className="feature-icon">📞</div>
                  <div className="feature-card-title">Govt Health Helplines</div>
                  <div className="feature-card-desc">
                    National Emergency (108, 112), Tele-MANAS (14416), PM-JAY (14555), Poison Control, and senior citizen health numbers with 1-click dial.
                  </div>
                </div>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', width: '100%', justifyContent: 'center' }}>
                  View Emergency Numbers ➔
                </button>
              </div>

              <div className="feature-card" onClick={() => { setRegistryFileFilter('patients'); setShowRegistryModal(true); }}>
                <div>
                  <div className="feature-icon">📋</div>
                  <div className="feature-card-title">Patient Records Registry</div>
                  <div className="feature-card-desc">
                    Manage patient clinical notes, EHR extracts, case hearing transcripts, and intake files stored in Patient Medical Records Database.
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
                    Manage hospital SOPs, telemedicine protocols, surgical governance rules, and HIPAA directives stored in Hospital Policies Registry.
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
              <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>📤 Export Markdown Report</button>
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

        {/* Page 6: Government Health Emergency & Helplines Directory Workspace */}
        {activePage === 'helplines' && (
          <div className="clean-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-heading)', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  📞 Official Government Health Helplines Directory
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Verified emergency response lines, mental health support, PM-JAY health insurance support, and statutory health authorities.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.76rem', padding: '6px 12px' }}>
                  ✅ Official MOHFW / AIIMS / NITI Aayog Verified
                </span>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {['All', 'Emergency & Ambulance', 'Mental Health & Counseling', 'Health Insurance & PM-JAY', 'Specialized Centers', 'Elder & Child Care'].map(cat => (
                <button 
                  key={cat}
                  className={`btn ${helplineCategoryFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                  onClick={() => setHelplineCategoryFilter(cat)}
                >
                  {cat === 'All' ? '📁 All Lines' : cat}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ marginBottom: '20px' }}>
              <input 
                type="text" 
                className="search-input" 
                style={{ width: '100%', padding: '12px 16px', fontSize: '0.92rem' }}
                placeholder="Search helpline number, service title, emergency type, or agency..." 
                value={helplineSearch}
                onChange={e => setHelplineSearch(e.target.value)}
              />
            </div>

            {/* Helplines Card Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {getFilteredHelplines().map(h => (
                <div 
                  key={h.id} 
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '1.8rem' }}>{h.icon}</span>
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{h.category}</span>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', fontFamily: 'var(--font-heading)', color: 'white', fontWeight: 700, marginBottom: '4px' }}>
                      {h.name}
                    </h3>
                    
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-cyan)', fontWeight: 600, marginBottom: '12px' }}>
                      🏛️ {h.agency}
                    </div>

                    <div style={{ background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '10px', padding: '12px', textAlign: 'center', marginBottom: '14px' }}>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-code)', letterSpacing: '0.5px' }}>
                        {h.number}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', fontWeight: 600, marginTop: '2px' }}>
                        🕒 {h.hours}
                      </div>
                    </div>

                    <p style={{ fontSize: '0.84rem', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                      {h.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <a 
                      href={`tel:${h.number.split('/')[0].trim().replace(/[^0-9]/g, '')}`} 
                      className="btn btn-primary" 
                      style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', fontSize: '0.82rem' }}
                    >
                      📞 Direct Dial
                    </a>
                    <button 
                      className="btn btn-secondary" 
                      style={{ fontSize: '0.82rem' }}
                      onClick={() => {
                        navigator.clipboard.writeText(h.number);
                        alert(`Copied helpline number: ${h.number}`);
                      }}
                    >
                      📋 Copy Number
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page 7: Affiliated Hospital Facilities Registry */}
        {activePage === 'facilities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Page Header */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  🏥 Affiliated Hospital Facilities Registry
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Registered hospitals, trauma centers, and virtual care networks affiliated with Healio Clinical AI Platform.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setShowFacilityModal(true)}>
                  ➕ Register New Hospital Facility
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  const jsonStr = exportFacilitiesJSON();
                  downloadFile(jsonStr, 'facilities_registry.json', 'application/json');
                  addLogEntry('Exported Facilities Registry', 'Downloaded facilities_registry.json');
                }}>
                  💾 Export Facilities JSON
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input 
                type="text" 
                className="search-input" 
                style={{ flex: 1 }} 
                placeholder="🔍 Search facilities by name, location, accreditation ID, or services..." 
                value={facilitySearch} 
                onChange={e => setFacilitySearch(e.target.value)} 
              />
              <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                Showing {getFilteredFacilities().length} of {facilities.length} Facilities
              </div>
            </div>

            {/* Facilities Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {getFilteredFacilities().length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                  🏢 No hospital facilities match your search query. Click "Register New Hospital Facility" above to add one.
                </div>
              ) : (
                getFilteredFacilities().map((fac) => (
                  <div key={fac.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '1.05rem', color: 'white', fontWeight: 700 }}>{fac.name}</h3>
                        <span className="status-badge" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                          {fac.complianceStatus || 'Compliant'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--primary-cyan)', marginBottom: '10px', fontWeight: 600 }}>
                        {fac.type} | Accreditation: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>{fac.accreditationId}</code>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: 'var(--text-main)', marginBottom: '12px' }}>
                        <div>📍 <strong>Location:</strong> {fac.location}</div>
                        <div>📞 <strong>Emergency Helpline:</strong> {fac.emergencyContact}</div>
                        <div>✉️ <strong>Email:</strong> {fac.email}</div>
                        <div>👨‍⚕️ <strong>Physicians:</strong> {fac.physicianCount} Active | <strong>PA Cap:</strong> {fac.paRatioCap}</div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {fac.services && fac.services.map((srv, idx) => (
                          <span key={idx} className="badge badge-info" style={{ fontSize: '0.66rem' }}>
                            {srv}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        Registered: {new Date(fac.registeredAt).toLocaleDateString()}
                      </span>
                      {userRole === 'staff' && (
                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: '0.72rem', color: '#fb7185', padding: '4px 8px' }} 
                          onClick={() => handleDeleteFacility(fac.id, fac.name)}
                        >
                          🗑️ Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


        {/* Page 8: Medical Query Bot & Executive Summary Synthesis */}
        {activePage === 'querybot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Banner */}
            <div style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)', border: '1px solid rgba(129, 140, 248, 0.3)', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: 'rgba(129, 140, 248, 0.2)', color: '#818cf8', borderRadius: '10px', padding: '8px 12px', fontSize: '1.4rem' }}>🤖</div>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-heading)', color: 'white', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Clinical AI Medical Query Bot & Executive Summary
                      <span className="badge" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', color: 'white', fontSize: '0.66rem' }}>
                        ✨ Powered by Google Gemini AI
                      </span>
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      Search any clinical, medical, or statutory question. Automatically connects to Google Gemini AI for queries outside loaded documents.
                    </p>
                  </div>
                </div>

                {/* AI Query Mode Selector Toggle */}
                <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(129, 140, 248, 0.3)', borderRadius: '8px', padding: '3px' }}>
                  <button 
                    style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.74rem', border: 'none', cursor: 'pointer', background: !useGeminiMode ? 'var(--primary-cyan)' : 'transparent', color: !useGeminiMode ? 'black' : 'var(--text-muted)', fontWeight: 700 }}
                    onClick={() => setUseGeminiMode(false)}
                  >
                    📄 Document Registries Mode
                  </button>
                  <button 
                    style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.74rem', border: 'none', cursor: 'pointer', background: useGeminiMode ? 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' : 'transparent', color: useGeminiMode ? 'white' : 'var(--text-muted)', fontWeight: 700 }}
                    onClick={() => setUseGeminiMode(true)}
                  >
                    ✨ Google Gemini AI Mode
                  </button>
                </div>
              </div>

              {/* Query Search Form */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <input 
                  type="text" 
                  className="search-input" 
                  style={{ flex: 1, borderColor: useGeminiMode ? '#c084fc' : '#818cf8', fontSize: '0.95rem', padding: '12px 16px' }} 
                  placeholder={useGeminiMode ? "Ask Google Gemini any medical or health question (e.g. What are symptoms of Type 2 Diabetes? / How does Aspirin work?)..." : "Ask any medical or statutory question (e.g., What are mandatory PDMP checking rules? / PA ratio caps)..."} 
                  value={botSearchInput} 
                  onChange={e => setBotSearchInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleExecuteBotQuery()} 
                />
                <button 
                  className="btn btn-primary" 
                  style={{ background: useGeminiMode ? 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', padding: '12px 24px', fontSize: '0.92rem', fontWeight: 700 }} 
                  onClick={() => handleExecuteBotQuery()}
                >
                  {isBotSearching ? '⏳ Synthesizing...' : (useGeminiMode ? '✨ Ask Gemini AI' : '🔍 Search & Synthesize')}
                </button>
              </div>

              {/* Quick Suggested Prompts */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>Suggested Queries:</span>
                {(useGeminiMode ? [
                  "What are early warning signs & symptoms of Type 2 Diabetes?",
                  "How does Aspirin function as an antiplatelet medication?",
                  "What are standard clinical dosage & side effects of Metformin?",
                  "What is the clinical difference between viral & bacterial pneumonia?",
                  "What acute emergency steps should be taken during anaphylactic shock?"
                ] : [
                  "What are the mandatory PDMP lookup & narcotic checking rules?",
                  "What are the physician supervision cap & PA ratio limits?",
                  "What emergency steps & address verification rules apply to 911 dispatch?",
                  "What are informed consent & certified interpreter mandates?",
                  "What HIPAA ePHI encryption & breach notification rules apply?"
                ]).map((prompt, idx) => (
                  <button 
                    key={idx} 
                    className="btn btn-secondary" 
                    style={{ fontSize: '0.72rem', padding: '4px 10px', background: 'rgba(129, 140, 248, 0.1)', borderColor: 'rgba(129, 140, 248, 0.25)', color: '#c7d2fe' }} 
                    onClick={() => {
                      setBotSearchInput(prompt);
                      handleExecuteBotQuery(prompt);
                    }}
                  >
                    💡 {prompt}
                  </button>
                ))}
              </div>


              {/* Recent Query History Chips */}
              {botQueryHistory.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Recent Searches:</span>
                  {botQueryHistory.map((h, i) => (
                    <span key={i} className="status-badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#a5b4fc', fontSize: '0.68rem', cursor: 'pointer' }} onClick={() => { setBotSearchInput(h); handleExecuteBotQuery(h); }}>
                      🕒 {h}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Query Executive Summary Results Card */}
            {botQueryResult && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Header Stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Query Executive Summary</span>
                      <span className="badge" style={{ background: botQueryResult.source?.includes('Gemini') ? 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' : 'rgba(6, 182, 212, 0.2)', color: 'white', fontSize: '0.68rem' }}>
                        {botQueryResult.source?.includes('Gemini') ? '✨ Google Gemini AI' : '📄 Document Registry'}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', color: 'white', fontWeight: 700 }}>{botQueryResult.query}</h3>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Grounding Score</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: botQueryResult.confidence >= 75 ? '#34d399' : '#fbbf24' }}>
                        {botQueryResult.confidence}% Confidence
                      </div>
                    </div>
                    <button className="btn btn-secondary" onClick={() => {
                      const exportText = `# MEDICAL QUERY EXECUTIVE SUMMARY\n**Query:** ${botQueryResult.query}\n**Source:** ${botQueryResult.source || 'Medical AI'}\n**Risk Level:** ${botQueryResult.riskLevel}\n**Evidence Confidence:** ${botQueryResult.confidence}%\n\n---\n\n## Overview\n${botQueryResult.overview}\n\n## Verbatim Line Citations\n` +
                        botQueryResult.citations.map(c => `- [${c.docTitle} - Line ${c.lineNumber}]: "${c.text}"`).join('\n');
                      downloadFile(exportText, `query-summary-${Date.now()}.md`, 'text/markdown');
                      addLogEntry('Exported Query Summary', `Exported query summary for "${botQueryResult.query}"`);
                    }}>
                      💾 Export Query Summary
                    </button>
                  </div>
                </div>


                {/* Synthesized Overview Response */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(129, 140, 248, 0.2)', borderRadius: '10px', padding: '18px', color: '#e2e8f0', lineHeight: 1.6, fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>
                  {botQueryResult.overview}
                </div>

                {/* Verbatim Citations Trace */}
                {botQueryResult.citations && botQueryResult.citations.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.95rem', color: 'white', fontWeight: 700, marginBottom: '10px' }}>
                      📌 Verbatim Document Line Citations ({botQueryResult.citations.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {botQueryResult.citations.map((c, idx) => (
                        <div key={idx} style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--primary-cyan)', fontWeight: 600 }}>📄 {c.docTitle}</span>
                            <span className="badge badge-info" style={{ fontSize: '0.66rem' }}>Line {c.lineNumber}</span>
                          </div>
                          <div style={{ color: '#cbd5e1', fontStyle: 'italic' }}>"{c.text}"</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Takeaways & Action Recommendations */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid var(--border-card)', borderRadius: '10px', padding: '14px' }}>
                    <h4 style={{ fontSize: '0.86rem', color: '#38bdf8', fontWeight: 700, marginBottom: '8px' }}>💡 Key Verifiable Findings</h4>
                    <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {botQueryResult.takeaways && botQueryResult.takeaways.map((t, i) => (
                        <li key={i}><strong>{t.topic}:</strong> {t.text}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid var(--border-card)', borderRadius: '10px', padding: '14px' }}>
                    <h4 style={{ fontSize: '0.86rem', color: '#34d399', fontWeight: 700, marginBottom: '8px' }}>✅ Recommended Actions</h4>
                    <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {botQueryResult.recommendations && botQueryResult.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
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
              style={{ width: '100%', padding: '12px', fontSize: '1rem', textAlign: 'center', marginBottom: userRole === 'staff' ? '10px' : '16px' }} 
              placeholder={userRole === 'staff' ? 'e.g. Dr. Somesh / Auditor Jane Doe' : 'e.g. Patient John Smith'} 
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (userRole === 'staff' ? document.getElementById('staff-pwd-input')?.focus() : handleSaveUserName())}
              autoFocus
            />

            {/* Hospital Staff Password Authentication */}
            {userRole === 'staff' && (
              <div style={{ marginBottom: '16px' }}>
                <input 
                  id="staff-pwd-input"
                  type="password" 
                  className="search-input" 
                  style={{ width: '100%', padding: '12px', fontSize: '1rem', textAlign: 'center', borderColor: 'var(--primary-cyan)' }} 
                  placeholder="🔑 Enter Staff Password (admin)" 
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveUserName()}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  🔒 Hospital Staff access requires administrator authentication password (<code>admin</code>).
                </div>
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.95rem' }} onClick={handleSaveUserName}>
              Login as {userRole === 'staff' ? '🏥 Hospital Staff' : '👤 Patient'} ➔
            </button>
          </div>
        </div>
      )}

      {/* User Activity Log Modal — RESTRICTED TO HOSPITAL STAFF */}
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
                {userRole === 'staff' && (
                  <button className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={handleSwitchRole}>
                    🔄 Switch Role & Login
                  </button>
                )}
              </div>
            </div>

            {/* Access Control Enforcement: Patients CANNOT view other users' logs */}
            {userRole !== 'staff' ? (
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '30px', textAlign: 'center', margin: '20px 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔒</div>
                <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-amber)', fontSize: '1.1rem', marginBottom: '6px' }}>
                  Access Restricted to Hospital Staff
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', maxWidth: '480px', margin: '0 auto 16px auto' }}>
                  Only authorized <strong>🏥 Hospital Staff & Governance Auditors</strong> are permitted to inspect full user session logs and activity audit trails. Patients are not allowed to switch roles.
                </p>
              </div>
            ) : (
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
            )}

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
              {userRole === 'staff' ? (
                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', color: '#fb7185' }} onClick={() => {
                  if (confirm('Clear all session user logs?')) {
                    setActivityLogs([]);
                    localStorage.removeItem('healio_user_logs');
                  }
                }}>🗑️ Clear Activity Logs</button>
              ) : <div />}
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
                  <option value="auto">🔀 Auto-Detect & Split Dual Document (Patients + Policies)</option>
                  <option value="patients">📋 Patient Records File</option>
                  <option value="policies">🏥 Hospital Policies File</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Document Title</label>
                <input type="text" className="search-input" style={{ width: '100%' }} value={customDocTitle} onChange={e => setCustomDocTitle(e.target.value)} placeholder="e.g. Combined Patient History & Hospital Policy / SOP" />
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
                  Upload Document File (PDF, Word DOCX/DOC, Text, Markdown, CSV, HTML)
                </label>
                <input 
                  type="file" 
                  className="search-input" 
                  style={{ width: '100%', padding: '6px' }} 
                  accept=".pdf,.docx,.doc,.txt,.md,.csv,.rtf,.html,.htm" 
                  ref={fileInputRef} 
                  onChange={handleCustomFileUpload} 
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📄 PDF (.pdf)</span>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📝 Word (.docx, .doc)</span>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📑 Text & MD (.txt, .md)</span>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📊 Formatted Data (.csv, .html)</span>
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
                ⚡ {customTargetFile === 'auto' ? '🔀 Auto-Split & Insert into Registries' : `Insert into ${customTargetFile === 'patients' ? 'Patient Records File' : 'Hospital Policies File'}`}
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
              }}>💾 Download Markdown Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Register Hospital Facility Modal */}
      {showFacilityModal && (
        <div className="modal-overlay" onClick={() => setShowFacilityModal(false)}>
          <div className="modal-content" style={{ width: '600px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'white' }}>🏥 Register Hospital Facility with Healio</h3>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowFacilityModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Hospital Facility Name *</label>
                <input type="text" className="search-input" style={{ width: '100%' }} placeholder="e.g. Mercy General Hospital & Trauma Center" value={newFacilityName} onChange={e => setNewFacilityName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Facility Type</label>
                  <select className="search-input" style={{ width: '100%' }} value={newFacilityType} onChange={e => setNewFacilityType(e.target.value)}>
                    <option value="Tertiary Care Hospital">Tertiary Care Hospital</option>
                    <option value="Regional Medical Center">Regional Medical Center</option>
                    <option value="Telehealth Provider Network">Telehealth Provider Network</option>
                    <option value="Community Clinic">Community Clinic</option>
                    <option value="Specialty Surgical Center">Specialty Surgical Center</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>NPI / Accreditation ID</label>
                  <input type="text" className="search-input" style={{ width: '100%' }} placeholder="e.g. NPI-9842105742" value={newFacilityAccreditation} onChange={e => setNewFacilityAccreditation(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Full Physical Address / Location</label>
                <input type="text" className="search-input" style={{ width: '100%' }} placeholder="e.g. 450 Medical Parkway, Austin, TX 78701" value={newFacilityLocation} onChange={e => setNewFacilityLocation(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Emergency Helpline Contact</label>
                  <input type="text" className="search-input" style={{ width: '100%' }} placeholder="e.g. +1 (800) 555-0199" value={newFacilityContact} onChange={e => setNewFacilityContact(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Compliance Admin Email</label>
                  <input type="email" className="search-input" style={{ width: '100%' }} placeholder="e.g. admin@mercyhealth.org" value={newFacilityEmail} onChange={e => setNewFacilityEmail(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Active Physician Count</label>
                  <input type="number" className="search-input" style={{ width: '100%' }} min="1" value={newFacilityPhysicians} onChange={e => setNewFacilityPhysicians(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>PA Ratio Cap</label>
                  <select className="search-input" style={{ width: '100%' }} value={newFacilityPaCap} onChange={e => setNewFacilityPaCap(e.target.value)}>
                    <option value="1:4 (4 PAs per Supervising Physician)">1:4 (Standard Cap)</option>
                    <option value="1:3 (3 PAs per Supervising Physician)">1:3 (Strict Cap)</option>
                    <option value="1:2 (2 PAs per Supervising Physician)">1:2 (Conservative Cap)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Services & Specializations (Comma Separated)</label>
                <input type="text" className="search-input" style={{ width: '100%' }} placeholder="e.g. Emergency Care, Telemedicine Protocol, PDMP Integrated, Surgical Governance" value={newFacilityServices} onChange={e => setNewFacilityServices(e.target.value)} />
              </div>
              <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }} onClick={handleRegisterFacility}>
                ⚡ Register Facility into Affiliated Registries
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚨 SOS 112 Medical Emergency Dispatch Modal */}
      {showEmergencyModal && (
        <div className="modal-overlay" onClick={() => setShowEmergencyModal(false)}>
          <div className="modal-content" style={{ width: '560px', maxWidth: '95vw', border: '2px solid #ef4444', boxShadow: '0 0 30px rgba(239, 68, 68, 0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚨 SOS 112 Medical Emergency Dispatch
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowEmergencyModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.82rem', color: '#fca5a5', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                  National Universal Emergency Hotline
                </div>
                <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-code)', letterSpacing: '2px', textShadow: '0 0 10px rgba(239, 68, 68, 0.8)' }}>
                  112
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '4px' }}>
                  24/7 Universal Emergency Dispatch & Medical Ambulance Service
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <a 
                  href="tel:112" 
                  className="btn" 
                  style={{ flex: 1, justifyContent: 'center', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white', fontWeight: 800, fontSize: '1.05rem', padding: '12px', borderRadius: '8px', textDecoration: 'none', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)' }}
                  onClick={() => addLogEntry('Dialed 112 Emergency', 'Initiated direct phone call to 112 Medical Dispatch')}
                >
                  📞 CALL 112 EMERGENCY DISPATCH NOW
                </a>
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: '0.85rem' }} 
                  onClick={() => {
                    navigator.clipboard.writeText('112');
                    alert('Copied 112 Emergency Hotline number.');
                  }}
                >
                  📋 Copy 112
                </button>
              </div>

              {/* Statutory Emergency Address Protocol Guidance */}
              <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-card)', borderRadius: '10px', padding: '14px', fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: 'white', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📌 Emergency Protocol Directive (Statutory Rule 4.2)
                </div>
                Clinicians & callers must state the patient's exact <strong>physical address & location</strong> immediately upon dispatch connection. Maintain active communication until first responders arrive.
              </div>

              {/* Secondary Emergency Lines */}
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Secondary National Emergency Lines
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <a 
                    href="tel:102" 
                    className="btn btn-secondary" 
                    style={{ justifyContent: 'center', fontSize: '0.8rem', textDecoration: 'none', color: '#38bdf8' }}
                    onClick={() => addLogEntry('Dialed 102 Ambulance', 'Initiated direct call to 102 Ambulance Services')}
                  >
                    🚑 102 Ambulance Services
                  </a>
                  <a 
                    href="tel:108" 
                    className="btn btn-secondary" 
                    style={{ justifyContent: 'center', fontSize: '0.8rem', textDecoration: 'none', color: '#34d399' }}
                    onClick={() => addLogEntry('Dialed 108 Emergency', 'Initiated direct call to 108 Disaster Helpline')}
                  >
                    🆘 108 Emergency Response
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button className="btn btn-secondary" onClick={() => setShowEmergencyModal(false)}>Close Dispatch Portal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


