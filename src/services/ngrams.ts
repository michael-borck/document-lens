/**
 * N-gram extraction across the documents in a project.
 *
 * Local-only — uses the extracted_text already in the DB. Generates
 * bigrams and trigrams, with a small English stopword filter so the
 * top results aren't drowned in "of the" / "in the".
 */

import { selectAllKeyed } from './db'

export type NgramSize = 2 | 3

export interface NgramSourceDoc {
  documentId: string
  title: string
  year: number | null
  count: number
}

export interface NgramResult {
  phrase: string
  size: NgramSize
  /** Total occurrences across the corpus. */
  count: number
  /** Number of documents this phrase appeared in (1..corpus size). */
  documentCount: number
  /** Per-document breakdown — which docs contained this phrase and how many times each. */
  sources: NgramSourceDoc[]
}

export interface ComputeNgramsInput {
  projectId: string
  /**
   * When set, restrict to this single document (for "Discover within
   * one document" mode). When omitted, scans all project documents.
   */
  documentId?: string
  /** Which n-gram sizes to compute (default: both). */
  sizes?: NgramSize[]
  /** Drop n-grams below this corpus-wide count (default: 3). */
  minCount?: number
  /** Trim down the result set after sorting (default: 100). */
  topN?: number
}

export interface ComputeNgramsResult {
  documentCount: number
  totalTokens: number
  /** All eligible n-grams across all sizes, sorted by count desc. */
  results: NgramResult[]
}

const STOPWORDS = new Set<string>([
  'a','about','above','after','again','against','all','am','an','and','any','are','as','at',
  'be','because','been','before','being','below','between','both','but','by',
  'can','could','did','do','does','doing',
  'down','during','each','few','for','from','further',
  'had','has','have','having','he','her','here','hers','herself','him','himself','his','how',
  'i','if','in','into','is','it','its','itself',
  'just',
  'me','more','most','my','myself',
  'no','nor','not','now',
  'of','off','on','once','only','or','other','our','ours','ourselves','out','over','own',
  's','same','she','should','so','some','such',
  't','than','that','the','their','theirs','them','themselves','then','there','these','they','this','those','through','to','too',
  'under','until','up',
  'very',
  'was','we','were','what','when','where','which','while','who','whom','why','will','with','would',
  'you','your','yours','yourself','yourselves',
  // PDF-extraction noise
  'page','pages','annual','report','reports',
])

interface ProjectTextRow {
  id: string
  title: string | null
  filename: string
  year: number | null
  extracted_text: string | null
}

export async function computeNgrams(input: ComputeNgramsInput): Promise<ComputeNgramsResult> {
  const sizes = input.sizes && input.sizes.length > 0 ? input.sizes : [2, 3] as NgramSize[]
  const minCount = input.minCount ?? 3
  const topN = input.topN ?? 100

  const rows = input.documentId
    ? await selectAllKeyed<ProjectTextRow>('ngrams.projectDocText', [
        input.projectId,
        input.documentId,
      ])
    : await selectAllKeyed<ProjectTextRow>('ngrams.projectText', [input.projectId])

  // Doc metadata for source attribution on each n-gram.
  const docMeta = new Map<string, { title: string; year: number | null }>()
  for (const r of rows) {
    docMeta.set(r.id, { title: r.title ?? r.filename, year: r.year })
  }

  // For each phrase: total occurrences + per-document counts.
  // Map<docId, count> rather than Set<docId> so we can attribute matches per source.
  const phraseCounts = new Map<string, { count: number; size: NgramSize; docCounts: Map<string, number> }>()
  let totalTokens = 0

  for (const row of rows) {
    const text = row.extracted_text ?? ''
    if (!text) continue
    const tokens = tokenise(text)
    totalTokens += tokens.length
    for (const size of sizes) {
      for (let i = 0; i <= tokens.length - size; i++) {
        const window = tokens.slice(i, i + size)
        // Drop the n-gram if any constituent token is a stopword OR
        // is too short (e.g. single letters from broken extraction).
        if (window.some((t) => STOPWORDS.has(t) || t.length < 2)) continue
        const phrase = window.join(' ')
        let entry = phraseCounts.get(phrase)
        if (!entry) {
          entry = { count: 0, size, docCounts: new Map() }
          phraseCounts.set(phrase, entry)
        }
        entry.count++
        entry.docCounts.set(row.id, (entry.docCounts.get(row.id) ?? 0) + 1)
      }
    }
  }

  const results: NgramResult[] = []
  for (const [phrase, entry] of phraseCounts) {
    if (entry.count < minCount) continue
    const sources: NgramSourceDoc[] = []
    for (const [docId, count] of entry.docCounts) {
      const meta = docMeta.get(docId)
      if (!meta) continue
      sources.push({ documentId: docId, title: meta.title, year: meta.year, count })
    }
    sources.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    results.push({
      phrase,
      size: entry.size,
      count: entry.count,
      documentCount: entry.docCounts.size,
      sources,
    })
  }

  results.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))

  return {
    documentCount: rows.length,
    totalTokens,
    results: results.slice(0, topN),
  }
}

/**
 * Lowercase tokens, alphanumeric runs only. Strips punctuation and
 * digits-only tokens (which usually come from page numbers / years that
 * inflate noise).
 */
function tokenise(text: string): string[] {
  const out: string[] = []
  // Match runs of letters; allow apostrophes / hyphens within words.
  const matches = text.toLowerCase().matchAll(/[a-z][a-z'-]*/g)
  for (const m of matches) {
    const t = m[0].replace(/[''‵`]/g, "'").replace(/^['-]+|['-]+$/g, '')
    if (t.length === 0) continue
    out.push(t)
  }
  return out
}
