/**
 * Persistent Medical Document Registry & Knowledge Base Manager
 * Handles storing, retrieving, exporting, and importing structured medical documents in LocalStorage.
 */

const STORAGE_KEY = 'verimed_document_registry_v1';

/**
 * Retrieves all stored structured documents from LocalStorage.
 */
export function getStoredDocuments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load document registry from LocalStorage:', err);
    return [];
  }
}

/**
 * Saves a new structured document into persistent storage.
 */
export function saveDocumentToRegistry(docRecord) {
  const docs = getStoredDocuments();
  
  // Check if document with same ID already exists
  const existingIdx = docs.findIndex((d) => d.id === docRecord.id);
  if (existingIdx >= 0) {
    docs[existingIdx] = docRecord;
  } else {
    docs.unshift(docRecord); // Add newest first
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    return true;
  } catch (err) {
    console.error('Failed to save document to LocalStorage:', err);
    return false;
  }
}

/**
 * Removes a document from persistent storage by ID.
 */
export function deleteDocumentFromRegistry(docId) {
  let docs = getStoredDocuments();
  docs = docs.filter((d) => d.id !== docId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    return true;
  } catch (err) {
    console.error('Failed to delete document from LocalStorage:', err);
    return false;
  }
}

/**
 * Exports the entire document registry to a backup JSON string.
 */
export function exportRegistryJSON() {
  const docs = getStoredDocuments();
  const payload = {
    exportedAt: new Date().toISOString(),
    system: 'VeriMed AI Medical Document Registry',
    totalDocuments: docs.length,
    documents: docs
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Imports documents from a backup JSON string.
 */
export function importRegistryJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const docsToImport = Array.isArray(parsed) ? parsed : (parsed.documents || []);
    
    if (!Array.isArray(docsToImport)) return 0;

    let count = 0;
    docsToImport.forEach((doc) => {
      if (doc.id && doc.title && doc.rawContent) {
        saveDocumentToRegistry(doc);
        count++;
      }
    });
    return count;
  } catch (err) {
    console.error('Failed to import registry JSON:', err);
    return 0;
  }
}
