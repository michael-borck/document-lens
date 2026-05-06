/**
 * Document Service
 *
 * Handles document import, storage, and management operations.
 * Documents exist in a library and can belong to multiple projects.
 */

import { v4 as uuidv4 } from 'uuid'
import { api } from './api'

export interface DocumentRecord {
  id: string
  project_id: string | null  // Deprecated: use project_documents junction table
  filename: string
  file_path: string
  file_hash: string
  file_size: number | null
  content_type: string | null
  report_year: number | null
  company_name: string | null
  industry: string | null
  country: string | null
  report_type: string | null
  custom_tags: string | null
  custom_metadata: string | null
  extracted_text: string | null
  extracted_pages: string | null
  pdf_metadata: string | null
  inferred_metadata: string | null
  analysis_status: string
  analyzed_at: string | null
  created_at: string
}

export interface ImportProgress {
  total: number
  current: number
  currentFile: string
  status: 'pending' | 'importing' | 'processing' | 'completed' | 'failed'
  error?: string
}

export interface ImportResult {
  success: boolean
  documentId?: string
  filename: string
  error?: string
  alreadyInProject?: boolean
  alreadyInLibrary?: boolean
}

/**
 * Calculate SHA-256 hash of file contents for deduplication
 * Uses the actual file content to generate a deterministic hash
 */
async function calculateFileHash(filePath: string): Promise<string> {
  // Compute hash on main process (has access to file system)
  // This ensures same file = same hash regardless of when it's imported
  return window.electron.computeFileHash(filePath)
}

/**
 * Extract year from filename or content
 */
function extractYearFromFilename(filename: string): number | null {
  // Look for 4-digit year patterns (1990-2099)
  const yearMatch = filename.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    return parseInt(yearMatch[0], 10)
  }
  return null
}

/**
 * Extract company name from filename
 */
function extractCompanyFromFilename(filename: string): string | null {
  // Remove common suffixes and year patterns
  const name = filename
    .replace(/\.(pdf|PDF)$/, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+(annual|report|sustainability|csr|esg)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return name.length > 0 ? name : null
}

/**
 * Add a document to a project (junction table)
 */
export async function addDocumentToProject(documentId: string, projectId: string): Promise<void> {
  await window.electron.dbRun(
    'INSERT OR IGNORE INTO project_documents (project_id, document_id) VALUES (?, ?)',
    [projectId, documentId]
  )
  // Update project timestamp
  await window.electron.dbRun(
    'UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [projectId]
  )
}

/**
 * Remove a document from a project (does not delete the document)
 */
export async function removeDocumentFromProject(documentId: string, projectId: string): Promise<void> {
  await window.electron.dbRun(
    'DELETE FROM project_documents WHERE project_id = ? AND document_id = ?',
    [projectId, documentId]
  )
  // Update project timestamp
  await window.electron.dbRun(
    'UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [projectId]
  )
}

/**
 * Check if a document is in a project
 */
export async function isDocumentInProject(documentId: string, projectId: string): Promise<boolean> {
  const result = await window.electron.dbQuery<{ count: number }>(
    'SELECT COUNT(*) as count FROM project_documents WHERE project_id = ? AND document_id = ?',
    [projectId, documentId]
  )
  return result[0]?.count > 0
}

/**
 * Import a single document (or add existing to project)
 * If projectId is null, imports to library only without adding to any project.
 */
export async function importDocument(
  projectId: string | null,
  filePath: string,
  onProgress?: (status: string) => void
): Promise<ImportResult> {
  const filename = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown.pdf'

  try {
    onProgress?.('Calculating file hash...')
    const fileHash = await calculateFileHash(filePath)

    // Check if document already exists in library (by file hash)
    const existing = await window.electron.dbQuery<{ id: string }>(
      'SELECT id FROM documents WHERE file_hash = ?',
      [fileHash]
    )

    if (existing.length > 0) {
      const existingDocId = existing[0].id

      if (projectId) {
        // Check if already in this project
        const inProject = await isDocumentInProject(existingDocId, projectId)

        if (inProject) {
          return {
            success: false,
            filename,
            error: 'Document already exists in this project',
            alreadyInProject: true
          }
        }

        // Add existing document to this project
        onProgress?.('Adding to project...')
        await addDocumentToProject(existingDocId, projectId)
      }

      return {
        success: true,
        documentId: existingDocId,
        filename,
        alreadyInLibrary: true
      }
    }

    // New document - process and import
    onProgress?.('Processing PDF...')
    console.log('[Documents] Sending file path to API:', filePath)

    // Process through API - pass file path directly, backend reads the file
    const apiResult = await api.processFilePath(filePath, { include_extracted_text: true })

    // Extract metadata from filename and API response
    const reportYear = apiResult.inferred?.probable_year || extractYearFromFilename(filename)
    const companyName = apiResult.inferred?.probable_company || extractCompanyFromFilename(filename)

    // Generate document ID
    const documentId = uuidv4()

    // Insert into documents table (library)
    onProgress?.('Saving to database...')
    await window.electron.dbRun(
      `INSERT INTO documents (
        id, filename, file_path, file_hash, file_size, content_type,
        report_year, company_name, report_type,
        extracted_text, extracted_pages, pdf_metadata, inferred_metadata,
        analysis_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        filename,
        filePath,
        fileHash,
        apiResult.size || null,
        apiResult.content_type || 'application/pdf',
        reportYear,
        companyName,
        apiResult.inferred?.document_type || null,
        apiResult.extracted_text?.full_text || null,
        apiResult.extracted_text?.pages ? JSON.stringify(apiResult.extracted_text.pages) : null,
        apiResult.metadata ? JSON.stringify(apiResult.metadata) : null,
        apiResult.inferred ? JSON.stringify(apiResult.inferred) : null,
        'pending'
      ]
    )

    // Add to project via junction table (if projectId provided)
    if (projectId) {
      await addDocumentToProject(documentId, projectId)
    }

    return {
      success: true,
      documentId,
      filename
    }
  } catch (error) {
    console.error('Import error:', error)
    return {
      success: false,
      filename,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Import multiple documents with progress tracking
 * If projectId is null, imports to library only without adding to any project.
 */
export async function importDocuments(
  projectId: string | null,
  filePaths: string[],
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult[]> {
  const results: ImportResult[] = []

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    const filename = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown.pdf'

    onProgress?.({
      total: filePaths.length,
      current: i + 1,
      currentFile: filename,
      status: 'importing'
    })

    const result = await importDocument(projectId, filePath, (status) => {
      onProgress?.({
        total: filePaths.length,
        current: i + 1,
        currentFile: filename,
        status: 'processing'
      })
    })

    results.push(result)
  }

  onProgress?.({
    total: filePaths.length,
    current: filePaths.length,
    currentFile: '',
    status: 'completed'
  })

  return results
}

/**
 * Update document metadata
 */
export async function updateDocumentMetadata(
  documentId: string,
  metadata: Partial<Pick<DocumentRecord,
    'report_year' | 'company_name' | 'industry' | 'country' | 'report_type' | 'custom_tags'
  >>
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (metadata.report_year !== undefined) {
    updates.push('report_year = ?')
    values.push(metadata.report_year)
  }
  if (metadata.company_name !== undefined) {
    updates.push('company_name = ?')
    values.push(metadata.company_name)
  }
  if (metadata.industry !== undefined) {
    updates.push('industry = ?')
    values.push(metadata.industry)
  }
  if (metadata.country !== undefined) {
    updates.push('country = ?')
    values.push(metadata.country)
  }
  if (metadata.report_type !== undefined) {
    updates.push('report_type = ?')
    values.push(metadata.report_type)
  }
  if (metadata.custom_tags !== undefined) {
    updates.push('custom_tags = ?')
    values.push(metadata.custom_tags)
  }

  if (updates.length === 0) return

  values.push(documentId)

  await window.electron.dbRun(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

/**
 * Get the projects a document belongs to
 */
export async function getDocumentProjects(documentId: string): Promise<{ id: string; name: string }[]> {
  return window.electron.dbQuery<{ id: string; name: string }>(
    `SELECT p.id, p.name FROM projects p
     INNER JOIN project_documents pd ON pd.project_id = p.id
     WHERE pd.document_id = ?`,
    [documentId]
  )
}

/**
 * Get project count for multiple documents
 */
export async function getDocumentsProjectCount(documentIds: string[]): Promise<Map<string, number>> {
  const placeholders = documentIds.map(() => '?').join(', ')
  const results = await window.electron.dbQuery<{ document_id: string; project_count: number }>(
    `SELECT document_id, COUNT(*) as project_count
     FROM project_documents
     WHERE document_id IN (${placeholders})
     GROUP BY document_id`,
    documentIds
  )
  const countMap = new Map<string, number>()
  for (const r of results) {
    countMap.set(r.document_id, r.project_count)
  }
  return countMap
}

/**
 * Delete a document from library (removes from all projects)
 */
export async function deleteDocument(documentId: string): Promise<void> {
  await window.electron.dbRun('DELETE FROM documents WHERE id = ?', [documentId])
}

/**
 * Delete multiple documents from library
 */
export async function deleteDocuments(documentIds: string[]): Promise<void> {
  const placeholders = documentIds.map(() => '?').join(', ')
  await window.electron.dbRun(
    `DELETE FROM documents WHERE id IN (${placeholders})`,
    documentIds
  )
}

/**
 * Get all documents for a project (using junction table)
 */
export async function getProjectDocuments(projectId: string): Promise<DocumentRecord[]> {
  return window.electron.dbQuery<DocumentRecord>(
    `SELECT d.* FROM documents d
     INNER JOIN project_documents pd ON d.id = pd.document_id
     WHERE pd.project_id = ?
     ORDER BY pd.added_at DESC`,
    [projectId]
  )
}

/**
 * Get all documents in the library
 */
export async function getAllDocuments(): Promise<DocumentRecord[]> {
  return window.electron.dbQuery<DocumentRecord>(
    'SELECT * FROM documents ORDER BY created_at DESC'
  )
}

/**
 * Get documents not in a specific project
 */
export async function getDocumentsNotInProject(projectId: string): Promise<DocumentRecord[]> {
  return window.electron.dbQuery<DocumentRecord>(
    `SELECT d.* FROM documents d
     WHERE d.id NOT IN (
       SELECT document_id FROM project_documents WHERE project_id = ?
     )
     ORDER BY d.created_at DESC`,
    [projectId]
  )
}

/**
 * Get a single document
 */
export async function getDocument(documentId: string): Promise<DocumentRecord | null> {
  const results = await window.electron.dbQuery<DocumentRecord>(
    'SELECT * FROM documents WHERE id = ?',
    [documentId]
  )
  return results[0] || null
}

/**
 * Document status information for UI display
 */
export interface DocumentStatus {
  textAvailable: boolean
  pdfAvailable: boolean
  analysisComplete: boolean
}

/**
 * Check if a PDF file exists at the given path
 */
export async function checkPdfExists(filePath: string): Promise<boolean> {
  try {
    const stats = await window.electron.getFileStats(filePath)
    return stats.size > 0
  } catch {
    return false
  }
}

/**
 * Get document status (text available, PDF available, analysis complete)
 */
export async function getDocumentStatus(doc: DocumentRecord): Promise<DocumentStatus> {
  const pdfAvailable = await checkPdfExists(doc.file_path)

  return {
    textAvailable: doc.extracted_text !== null && doc.extracted_text.length > 0,
    pdfAvailable,
    analysisComplete: doc.analysis_status === 'completed'
  }
}

/**
 * Get all documents with their status
 */
export async function getAllDocumentsWithStatus(): Promise<Array<DocumentRecord & { status: DocumentStatus }>> {
  const docs = await getAllDocuments()

  return Promise.all(
    docs.map(async (doc) => ({
      ...doc,
      status: await getDocumentStatus(doc)
    }))
  )
}

/**
 * Re-extract text from a document's PDF
 * Useful when extraction algorithm improves or text was corrupted
 */
export async function reExtractDocument(
  documentId: string,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the document
    const doc = await getDocument(documentId)
    if (!doc) {
      return { success: false, error: 'Document not found' }
    }

    // Check if PDF exists
    const pdfExists = await checkPdfExists(doc.file_path)
    if (!pdfExists) {
      return { success: false, error: 'PDF file not found at original location' }
    }

    onProgress?.('Re-extracting text from PDF...')

    // Re-process through API
    const apiResult = await api.processFilePath(doc.file_path, { include_extracted_text: true })

    onProgress?.('Updating database...')

    // Update the document with new extracted text
    await window.electron.dbRun(
      `UPDATE documents SET
        extracted_text = ?,
        extracted_pages = ?,
        pdf_metadata = ?,
        inferred_metadata = ?,
        analysis_status = 'pending',
        analyzed_at = NULL
       WHERE id = ?`,
      [
        apiResult.extracted_text?.full_text || null,
        apiResult.extracted_text?.pages ? JSON.stringify(apiResult.extracted_text.pages) : null,
        apiResult.metadata ? JSON.stringify(apiResult.metadata) : null,
        apiResult.inferred ? JSON.stringify(apiResult.inferred) : null,
        documentId
      ]
    )

    // Clear old analysis results since text changed
    await window.electron.dbRun(
      'DELETE FROM analysis_results WHERE document_id = ?',
      [documentId]
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

