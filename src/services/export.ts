/**
 * Export Service
 * 
 * Handles exporting data in various formats: CSV, Excel, JSON, and ZIP bundles.
 */

import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import type { DocumentRecord } from './documents'
import type { BatchKeywordSearchResult } from './analysis'
import type { NgramAnalysisResult } from './ngrams'
import type { AnalysisProfile, ProfileConfig } from './profiles'
import type {
  BundleManifest,
  BundleDocumentData,
  BundleProfileData,
  BundleKeywordListData,
} from './import'

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'csv' | 'xlsx' | 'json'

export interface ProjectExportOptions {
  includeDocumentSummary: boolean
  includeDocumentText: boolean
  includeAnalysisResults: boolean
  includeKeywordResults: boolean
  includeNgramResults: boolean
  format: ExportFormat
}

export interface DocumentExportData {
  document: DocumentRecord
  analysis?: {
    readability?: Record<string, number>
    writingQuality?: Record<string, number>
    wordAnalysis?: {
      totalWords: number
      uniqueWords: number
      topWords: Array<{ word: string; count: number }>
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_\-.]/gi, '_').substring(0, 100)
}

function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename)
}

// ============================================================================
// CSV Export
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function arrayToCsv<T extends Record<string, any>>(data: T[]): string {
  if (data.length === 0) return ''

  const headers = Object.keys(data[0])
  const lines: string[] = [headers.join(',')]

  for (const row of data) {
    const values = headers.map((h) => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      if (typeof val === 'string') {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }
      return String(val)
    })
    lines.push(values.join(','))
  }

  return lines.join('\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function downloadCsv<T extends Record<string, any>>(data: T[], filename: string): void {
  const csv = arrayToCsv(data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

// ============================================================================
// Excel Export
// ============================================================================

 
export function downloadExcel(
  sheets: Array<{ name: string; data: any[] }>,
  filename: string
): void {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    if (sheet.data.length === 0) continue
    const worksheet = XLSX.utils.json_to_sheet(sheet.data)
    
    // Auto-size columns
    const maxWidths: number[] = []
    const headers = Object.keys(sheet.data[0])
    headers.forEach((h, i) => {
      maxWidths[i] = Math.min(50, Math.max(
        h.length,
        ...sheet.data.map((row) => String(row[h] || '').length)
      ))
    })
    worksheet['!cols'] = maxWidths.map((w) => ({ wch: w }))
    
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.substring(0, 31))
  }

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

// ============================================================================
// JSON Export
// ============================================================================

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}

// ============================================================================
// Document Export
// ============================================================================

export async function exportDocument(
  documentId: string,
  includeText: boolean = true
): Promise<DocumentExportData> {
  // Get document
  const docs = await window.electron.dbQuery<DocumentRecord>(
    'SELECT * FROM documents WHERE id = ?',
    [documentId]
  )
  
  if (docs.length === 0) {
    throw new Error('Document not found')
  }

  const document = docs[0]

  // Get analysis results
  const analysisRows = await window.electron.dbQuery<{
    analysis_type: string
    results: string
  }>(
    'SELECT analysis_type, results FROM analysis_results WHERE document_id = ?',
    [documentId]
  )

  const analysis: DocumentExportData['analysis'] = {}
  for (const row of analysisRows) {
    try {
      const parsed = JSON.parse(row.results)
      if (row.analysis_type === 'readability') {
        analysis.readability = parsed
      } else if (row.analysis_type === 'writing_quality') {
        analysis.writingQuality = parsed
      } else if (row.analysis_type === 'word_analysis') {
        analysis.wordAnalysis = parsed
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // Optionally strip text to reduce file size
  const exportDoc = includeText
    ? document
    : { ...document, extracted_text: null, extracted_pages: null }

  return {
    document: exportDoc,
    analysis: Object.keys(analysis).length > 0 ? analysis : undefined,
  }
}

export async function downloadDocumentJson(
  documentId: string,
  includeText: boolean = true
): Promise<void> {
  const data = await exportDocument(documentId, includeText)
  const filename = sanitizeFilename(data.document.filename.replace('.pdf', ''))
  downloadJson(data, `${filename}-export.json`)
}

// ============================================================================
// Project Summary Export
// ============================================================================

export interface ProjectSummaryRow {
  filename: string
  company_name: string
  report_year: number | string
  industry: string
  country: string
  analysis_status: string
  word_count: number | string
  flesch_reading_ease: number | string
  flesch_kincaid_grade: number | string
  vocabulary_richness: number | string
  imported_at: string
  analyzed_at: string
}

export async function getProjectSummaryData(
  projectId: string
): Promise<ProjectSummaryRow[]> {
  const documents = await window.electron.dbQuery<DocumentRecord>(
    `SELECT d.* FROM documents d
     INNER JOIN project_documents pd ON pd.document_id = d.id
     WHERE pd.project_id = ? ORDER BY d.created_at`,
    [projectId]
  )

  const summaryRows: ProjectSummaryRow[] = []

  for (const doc of documents) {
    // Get analysis results
    const analysisRows = await window.electron.dbQuery<{
      analysis_type: string
      results: string
    }>(
      'SELECT analysis_type, results FROM analysis_results WHERE document_id = ?',
      [doc.id]
    )

    let textMetrics: { word_count?: number } = {}
    let readability: Record<string, number> = {}
    let wordAnalysis: { vocabulary_richness?: number } = {}
    let writingQuality: { vocabulary_richness?: number } = {}

    for (const row of analysisRows) {
      try {
        const parsed = JSON.parse(row.results)
        if (row.analysis_type === 'text_metrics') textMetrics = parsed
        if (row.analysis_type === 'readability') readability = parsed
        if (row.analysis_type === 'word_analysis') wordAnalysis = parsed
        if (row.analysis_type === 'writing_quality') writingQuality = parsed
      } catch {
        // Skip
      }
    }

    summaryRows.push({
      filename: doc.filename,
      company_name: doc.company_name || '',
      report_year: doc.report_year || '',
      industry: doc.industry || '',
      country: doc.country || '',
      analysis_status: doc.analysis_status,
      word_count: textMetrics.word_count || '',
      flesch_reading_ease: (readability.flesch_score ?? readability.flesch_reading_ease)?.toFixed(1) || '',
      flesch_kincaid_grade: readability.flesch_kincaid_grade?.toFixed(1) || '',
      vocabulary_richness: wordAnalysis.vocabulary_richness
        ? (wordAnalysis.vocabulary_richness * 100).toFixed(1) + '%'
        : (writingQuality.vocabulary_richness
          ? (writingQuality.vocabulary_richness * 100).toFixed(1) + '%'
          : ''),
      imported_at: formatDate(doc.created_at),
      analyzed_at: doc.analyzed_at ? formatDate(doc.analyzed_at) : '',
    })
  }

  return summaryRows
}

export async function exportProjectSummary(
  projectId: string,
  projectName: string,
  format: 'csv' | 'xlsx'
): Promise<void> {
  const data = await getProjectSummaryData(projectId)
  const filename = sanitizeFilename(`${projectName}-summary-${formatDate(new Date())}`)

  if (format === 'csv') {
    downloadCsv(data, filename)
  } else {
    downloadExcel([{ name: 'Project Summary', data }], filename)
  }
}

// ============================================================================
// Keyword Results Export
// ============================================================================

export interface KeywordResultRow {
  document: string
  company: string
  year: number | string
  keyword: string
  count: number
  contexts: string
}

export function keywordResultsToRows(
  results: BatchKeywordSearchResult
): KeywordResultRow[] {
  const rows: KeywordResultRow[] = []

  for (const doc of results.documents) {
    for (const [keyword, match] of Object.entries(doc.matches)) {
      rows.push({
        document: doc.documentName,
        company: doc.companyName || '',
        year: doc.reportYear || '',
        keyword,
        count: match.count,
        contexts: match.contexts.slice(0, 3).map((c) => c.text).join(' | '),
      })
    }
  }

  return rows.sort((a, b) => b.count - a.count)
}

export function exportKeywordResults(
  results: BatchKeywordSearchResult,
  filename: string,
  format: 'csv' | 'xlsx'
): void {
  const rows = keywordResultsToRows(results)

  // Also create summary sheet for Excel
  const summaryRows = Object.entries(results.summary.keywordCounts)
    .map(([keyword, count]) => ({ keyword, total_count: count }))
    .sort((a, b) => b.total_count - a.total_count)

  if (format === 'csv') {
    downloadCsv(rows, filename)
  } else {
    downloadExcel(
      [
        { name: 'Keyword Results', data: rows },
        { name: 'Summary', data: summaryRows },
      ],
      filename
    )
  }
}

// ============================================================================
// N-gram Results Export
// ============================================================================

export interface NgramResultRow {
  phrase: string
  total_count: number
  document_count: number
  documents: string
}

export function ngramResultsToRows(results: NgramAnalysisResult): NgramResultRow[] {
  return results.aggregated.map((ngram) => ({
    phrase: ngram.phrase,
    total_count: ngram.totalCount,
    document_count: ngram.documentCount,
    documents: ngram.byDocument.map((d) => `${d.documentName} (${d.count})`).join('; '),
  }))
}

export function exportNgramResults(
  results: NgramAnalysisResult,
  filename: string,
  format: 'csv' | 'xlsx'
): void {
  const rows = ngramResultsToRows(results)

  // Per-document breakdown for Excel
  const docRows: Array<{ document: string; phrase: string; count: number }> = []
  for (const doc of results.documents) {
    for (const ngram of doc.ngrams) {
      docRows.push({
        document: doc.documentName,
        phrase: ngram.phrase,
        count: ngram.count,
      })
    }
  }

  if (format === 'csv') {
    downloadCsv(rows, filename)
  } else {
    downloadExcel(
      [
        { name: 'Aggregated', data: rows },
        { name: 'By Document', data: docRows },
      ],
      filename
    )
  }
}

// ============================================================================
// Full Project ZIP Export
// ============================================================================

export async function exportFullProject(
  projectId: string,
  projectName: string,
  options: ProjectExportOptions
): Promise<void> {
  const zip = new JSZip()
  const timestamp = formatDate(new Date())
  const safeName = sanitizeFilename(projectName)

  // Get all documents in project
  const documents = await window.electron.dbQuery<DocumentRecord>(
    `SELECT d.* FROM documents d
     INNER JOIN project_documents pd ON pd.document_id = d.id
     WHERE pd.project_id = ?`,
    [projectId]
  )

  // 1. Project Summary
  if (options.includeDocumentSummary) {
    const summaryData = await getProjectSummaryData(projectId)
    if (options.format === 'csv') {
      zip.file(`${safeName}-summary.csv`, arrayToCsv(summaryData))
    } else if (options.format === 'xlsx') {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, ws, 'Summary')
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      zip.file(`${safeName}-summary.xlsx`, buffer)
    } else {
      zip.file(`${safeName}-summary.json`, JSON.stringify(summaryData, null, 2))
    }
  }

  // 2. Individual Document Data
  if (options.includeDocumentText || options.includeAnalysisResults) {
    const docsFolder = zip.folder('documents')
    
    for (const doc of documents) {
      const docData = await exportDocument(doc.id, options.includeDocumentText)
      const docFilename = sanitizeFilename(doc.filename.replace('.pdf', ''))
      docsFolder?.file(`${docFilename}.json`, JSON.stringify(docData, null, 2))
    }
  }

  // 3. Keyword Results (if any saved)
  if (options.includeKeywordResults) {
    const keywordResults = await window.electron.dbQuery<{
      id: string
      selected_keywords: string
      results: string
      created_at: string
    }>(
      'SELECT * FROM keyword_results WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
      [projectId]
    )

    if (keywordResults.length > 0) {
      try {
        const results = JSON.parse(keywordResults[0].results) as BatchKeywordSearchResult
        const rows = keywordResultsToRows(results)
        
        if (options.format === 'csv') {
          zip.file(`${safeName}-keywords.csv`, arrayToCsv(rows))
        } else if (options.format === 'xlsx') {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, 'Keywords')
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
          zip.file(`${safeName}-keywords.xlsx`, buffer)
        } else {
          zip.file(`${safeName}-keywords.json`, JSON.stringify(results, null, 2))
        }
      } catch {
        // Skip invalid data
      }
    }
  }

  // 4. N-gram Results (if any saved)
  if (options.includeNgramResults) {
    const ngramResults = await window.electron.dbQuery<{
      id: string
      ngram_type: number
      results: string
      created_at: string
    }>(
      'SELECT * FROM ngram_results WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
      [projectId]
    )

    if (ngramResults.length > 0) {
      try {
        const results = JSON.parse(ngramResults[0].results) as NgramAnalysisResult
        const rows = ngramResultsToRows(results)
        
        if (options.format === 'csv') {
          zip.file(`${safeName}-ngrams.csv`, arrayToCsv(rows))
        } else if (options.format === 'xlsx') {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, 'N-grams')
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
          zip.file(`${safeName}-ngrams.xlsx`, buffer)
        } else {
          zip.file(`${safeName}-ngrams.json`, JSON.stringify(results, null, 2))
        }
      } catch {
        // Skip invalid data
      }
    }
  }

  // 5. Generate and download ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `${safeName}-export-${timestamp}.zip`)
}

// ============================================================================
// .lens Bundle Export
// ============================================================================

export interface LensBundleOptions {
  includeText: boolean
  includeAnalysis: boolean
  includeProfiles: boolean
  includePdfs: boolean
}

export interface LensBundleProgress {
  phase: 'documents' | 'profiles' | 'pdfs' | 'packaging'
  current: number
  total: number
  currentItem: string
}

/**
 * Get estimated bundle size before creating
 */
export async function estimateBundleSize(
  projectId: string,
  options: LensBundleOptions
): Promise<{ size: number; documentCount: number }> {
  let estimatedSize = 1024 // Base manifest size

  // Get documents in project
  const documents = await window.electron.dbQuery<DocumentRecord>(
    `SELECT d.* FROM documents d
     INNER JOIN project_documents pd ON pd.document_id = d.id
     WHERE pd.project_id = ?`,
    [projectId]
  )

  const documentCount = documents.length

  for (const doc of documents) {
    // Estimate JSON metadata size (approx 500 bytes per document)
    estimatedSize += 500

    if (options.includeText && doc.extracted_text) {
      estimatedSize += doc.extracted_text.length
    }

    if (options.includeAnalysis) {
      // Rough estimate for analysis results
      estimatedSize += 2000
    }

    if (options.includePdfs && doc.file_size) {
      estimatedSize += doc.file_size
    }
  }

  // Profiles (roughly 1KB each)
  if (options.includeProfiles) {
    const profiles = await window.electron.dbQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis_profiles WHERE project_id = ?',
      [projectId]
    )
    estimatedSize += (profiles[0]?.count || 0) * 1024
  }

  return { size: estimatedSize, documentCount }
}

/**
 * Export a project as a .lens bundle
 */
export async function exportLensBundle(
  projectId: string,
  projectName: string,
  options: LensBundleOptions,
  onProgress?: (progress: LensBundleProgress) => void
): Promise<void> {
  const zip = new JSZip()
  const safeName = sanitizeFilename(projectName)

  // Get app version
  const appVersion = await window.electron.getVersion()

  // Get all documents in project
  const documents = await window.electron.dbQuery<DocumentRecord>(
    `SELECT d.* FROM documents d
     INNER JOIN project_documents pd ON pd.document_id = d.id
     WHERE pd.project_id = ?`,
    [projectId]
  )

  // Create manifest
  const manifest: BundleManifest = {
    version: '1.0',
    format: 'lens-bundle',
    created_at: new Date().toISOString(),
    source: {
      project_id: projectId,
      project_name: projectName,
      app_version: appVersion
    },
    contents: {
      documents: documents.length,
      profiles: 0,
      includes_text: options.includeText,
      includes_analysis: options.includeAnalysis,
      includes_pdfs: options.includePdfs
    }
  }

  // Export documents
  const docsFolder = zip.folder('documents')
  let docIndex = 0

  for (const doc of documents) {
    docIndex++
    onProgress?.({
      phase: 'documents',
      current: docIndex,
      total: documents.length,
      currentItem: doc.filename
    })

    // Get analysis results if needed
    let analysisResults: Record<string, unknown> | null = null

    if (options.includeAnalysis) {
      const analysisRows = await window.electron.dbQuery<{
        analysis_type: string
        results: string
      }>(
        'SELECT analysis_type, results FROM analysis_results WHERE document_id = ?',
        [doc.id]
      )

      if (analysisRows.length > 0) {
        analysisResults = {}
        for (const row of analysisRows) {
          try {
            analysisResults[row.analysis_type] = JSON.parse(row.results)
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    // Build document data
    const docData: BundleDocumentData = {
      id: doc.id,
      filename: doc.filename,
      file_path: doc.file_path,
      file_size: doc.file_size,
      file_hash: doc.file_hash,
      content_type: doc.content_type,
      company_name: doc.company_name,
      report_year: doc.report_year,
      industry: doc.industry,
      country: doc.country,
      report_type: doc.report_type,
      custom_tags: doc.custom_tags,
      custom_metadata: doc.custom_metadata,
      extracted_text: options.includeText ? doc.extracted_text : null,
      extracted_pages: options.includeText ? doc.extracted_pages : null,
      pdf_metadata: doc.pdf_metadata,
      inferred_metadata: doc.inferred_metadata,
      analysis_status: doc.analysis_status,
      analysis_results: analysisResults,
      created_at: doc.created_at,
      analyzed_at: doc.analyzed_at
    }

    docsFolder?.file(`${doc.id}.json`, JSON.stringify(docData, null, 2))
  }

  // Export profiles
  if (options.includeProfiles) {
    const profiles = await window.electron.dbQuery<AnalysisProfile>(
      'SELECT * FROM analysis_profiles WHERE project_id = ?',
      [projectId]
    )

    manifest.contents.profiles = profiles.length

    const profsFolder = zip.folder('profiles')
    let profIndex = 0

    for (const prof of profiles) {
      profIndex++
      onProgress?.({
        phase: 'profiles',
        current: profIndex,
        total: profiles.length,
        currentItem: prof.name
      })

      let config: ProfileConfig
      try {
        config = JSON.parse(prof.config)
      } catch {
        continue  // Skip invalid profiles
      }

      const profData: BundleProfileData = {
        id: prof.id,
        name: prof.name,
        description: prof.description,
        config: config,
        is_active: prof.is_active,
        created_at: prof.created_at
      }

      profsFolder?.file(`${prof.id}.json`, JSON.stringify(profData, null, 2))
    }
  }

  // Export custom keyword lists referenced by profiles
  if (options.includeProfiles) {
    // Collect all keyword list IDs referenced in profile configs
    const referencedListIds = new Set<string>()
    const profiles = await window.electron.dbQuery<AnalysisProfile>(
      'SELECT config FROM analysis_profiles WHERE project_id = ?',
      [projectId]
    )

    for (const prof of profiles) {
      try {
        const config = JSON.parse(prof.config) as ProfileConfig
        if (config.keywords) {
          for (const key of Object.keys(config.keywords)) {
            // Custom lists are referenced by UUID, built-in by framework name
            // UUIDs contain hyphens and are 36 chars
            if (key.length > 20 && key.includes('-')) {
              referencedListIds.add(key)
            }
          }
        }
      } catch {
        // Skip invalid config
      }
    }

    if (referencedListIds.size > 0) {
      const klFolder = zip.folder('keyword_lists')

      for (const listId of referencedListIds) {
        const lists = await window.electron.dbQuery<{
          id: string; name: string; description: string | null;
          framework: string | null; focus: string | null;
          list_type: string; keywords: string
        }>(
          'SELECT id, name, description, framework, focus, list_type, keywords FROM keyword_lists WHERE id = ? AND is_builtin = 0',
          [listId]
        )

        if (lists.length > 0) {
          const list = lists[0]
          const klData: BundleKeywordListData = {
            id: list.id,
            name: list.name,
            description: list.description,
            framework: list.framework,
            focus: list.focus,
            list_type: list.list_type,
            keywords: list.keywords,
          }
          klFolder?.file(`${list.id}.json`, JSON.stringify(klData, null, 2))
        }
      }
    }
  }

  // Export PDFs (optional - can be very large)
  if (options.includePdfs) {
    const pdfsFolder = zip.folder('pdfs')
    let pdfIndex = 0

    for (const doc of documents) {
      pdfIndex++
      onProgress?.({
        phase: 'pdfs',
        current: pdfIndex,
        total: documents.length,
        currentItem: doc.filename
      })

      try {
        const fileBuffer = await window.electron.readFile(doc.file_path)
        pdfsFolder?.file(doc.filename, fileBuffer)
      } catch (error) {
        console.warn(`Could not include PDF ${doc.filename}:`, error)
        // Continue without this PDF - it may have been deleted
      }
    }
  }

  // Add manifest
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  // Package
  onProgress?.({
    phase: 'packaging',
    current: 1,
    total: 1,
    currentItem: 'Creating bundle...'
  })

  const timestamp = formatDate(new Date())
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  downloadBlob(zipBlob, `${safeName}-${timestamp}.lens`)
}
