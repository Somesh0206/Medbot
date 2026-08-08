/**
 * Persistent Dual-File Document Storage Engine
 * Manages two distinct document registry files:
 * 1. Patient Records File ('patients' -> medbot_patients_registry_v1)
 * 2. Hospital Policies File ('policies' -> medbot_policies_registry_v1)
 */

const PATIENTS_KEY = 'medbot_patients_registry_v1';
const POLICIES_KEY = 'medbot_policies_registry_v1';
const FACILITIES_KEY = 'medbot_facilities_registry_v1';

/**
 * Retrieves registered hospital facilities from LocalStorage (facilities_registry.json)
 */
export function getStoredFacilities() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FACILITIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to load facilities registry file:', err);
    return [];
  }
}

/**
 * Saves a new affiliated hospital facility into LocalStorage (facilities_registry.json)
 */
export function saveFacilityToRegistry(facilityRecord) {
  if (typeof window === 'undefined') return false;
  const facilities = getStoredFacilities();
  const existingIdx = facilities.findIndex((f) => f.id === facilityRecord.id);
  if (existingIdx >= 0) {
    facilities[existingIdx] = facilityRecord;
  } else {
    facilities.unshift(facilityRecord);
  }

  try {
    localStorage.setItem(FACILITIES_KEY, JSON.stringify(facilities));
    return true;
  } catch (err) {
    console.error('Failed to save facility to registry file:', err);
    return false;
  }
}

/**
 * Removes an affiliated facility from LocalStorage by ID
 */
export function deleteFacilityFromRegistry(facilityId) {
  if (typeof window === 'undefined') return false;
  let facilities = getStoredFacilities();
  facilities = facilities.filter((f) => f.id !== facilityId);
  try {
    localStorage.setItem(FACILITIES_KEY, JSON.stringify(facilities));
    return true;
  } catch (err) {
    console.error('Failed to delete facility:', err);
    return false;
  }
}

/**
 * Exports facilities registry file to JSON string
 */
export function exportFacilitiesJSON() {
  const facilities = getStoredFacilities();
  const payload = {
    exportedAt: new Date().toISOString(),
    registryFile: 'Affiliated Facilities File (facilities_registry.json)',
    totalFacilities: facilities.length,
    facilities
  };
  return JSON.stringify(payload, null, 2);
}


/**
 * Helper to determine storage key from target file identifier
 */
function getKeyForFile(targetFile) {
  return targetFile === 'patients' ? PATIENTS_KEY : POLICIES_KEY;
}

/**
 * Retrieves stored structured documents from LocalStorage for a target registry file ('patients' | 'policies' | 'all')
 */
export function getStoredDocuments(targetFile = 'all') {
  if (typeof window === 'undefined') return [];
  try {
    if (targetFile === 'patients') {
      const raw = localStorage.getItem(PATIENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    if (targetFile === 'policies') {
      const raw = localStorage.getItem(POLICIES_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    
    // Combined view for 'all'
    const patientsRaw = localStorage.getItem(PATIENTS_KEY);
    const policiesRaw = localStorage.getItem(POLICIES_KEY);
    const patients = patientsRaw ? JSON.parse(patientsRaw) : [];
    const policies = policiesRaw ? JSON.parse(policiesRaw) : [];
    
    return [
      ...patients.map((d) => ({ ...d, targetFile: 'patients' })),
      ...policies.map((d) => ({ ...d, targetFile: 'policies' }))
    ];
  } catch (err) {
    console.error('Failed to load document registry file:', err);
    return [];
  }
}

/**
 * Saves a new structured document into a target registry file ('patients' or 'policies')
 */
export function saveDocumentToRegistry(docRecord, targetFile) {
  if (typeof window === 'undefined') return false;
  const fileType = targetFile || docRecord.targetFile || (docRecord.category === 'Patient Records' || docRecord.id.includes('hearing') || docRecord.id.includes('transcript') || docRecord.id.includes('patient') ? 'patients' : 'policies');
  const storageKey = getKeyForFile(fileType);
  const recordToSave = { ...docRecord, targetFile: fileType };

  const docs = getStoredDocuments(fileType);
  const existingIdx = docs.findIndex((d) => d.id === recordToSave.id);
  if (existingIdx >= 0) {
    docs[existingIdx] = recordToSave;
  } else {
    docs.unshift(recordToSave);
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(docs));
    return true;
  } catch (err) {
    console.error(`Failed to save document to ${fileType} registry:`, err);
    return false;
  }
}

/**
 * Removes a document from a target registry file by ID
 */
export function deleteDocumentFromRegistry(docId, targetFile) {
  if (typeof window === 'undefined') return false;
  const fileTypes = targetFile && targetFile !== 'all' ? [targetFile] : ['patients', 'policies'];
  
  fileTypes.forEach((fType) => {
    const storageKey = getKeyForFile(fType);
    let docs = getStoredDocuments(fType);
    const initialLen = docs.length;
    docs = docs.filter((d) => d.id !== docId);
    if (docs.length !== initialLen) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(docs));
      } catch (err) {
        console.error(`Failed to delete document from ${fType}:`, err);
      }
    }
  });
  return true;
}

/**
 * Exports a specific registry file ('patients' or 'policies') to a JSON backup string
 */
export function exportRegistryFileJSON(targetFile = 'patients') {
  const docs = getStoredDocuments(targetFile);
  const payload = {
    exportedAt: new Date().toISOString(),
    registryFile: targetFile === 'patients' ? 'Patient Records File (patients_registry.json)' : 'Hospital Policies File (policies_registry.json)',
    fileCategory: targetFile,
    totalDocuments: docs.length,
    documents: docs
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Imports documents into a target registry file ('patients' or 'policies')
 */
export function importRegistryFileJSON(jsonString, defaultTargetFile = 'patients') {
  try {
    const parsed = JSON.parse(jsonString);
    const targetFile = parsed.fileCategory || defaultTargetFile;
    const docsToImport = Array.isArray(parsed) ? parsed : (parsed.documents || []);
    
    if (!Array.isArray(docsToImport)) return 0;

    let count = 0;
    docsToImport.forEach((doc) => {
      if (doc.id && doc.title && doc.rawContent) {
        saveDocumentToRegistry(doc, targetFile);
        count++;
      }
    });
    return count;
  } catch (err) {
    console.error('Failed to import registry file JSON:', err);
    return 0;
  }
}
