/**
 * Build the synthetic test-corpus PDFs (ADR-0028).
 *
 * Reads the Markdown sources in samples/test-corpus/docs, renders each to
 * styled HTML, and prints it to PDF with Playwright's Chromium (falling
 * back to installed Google Chrome). Only the Markdown is committed; PDFs
 * are build artifacts in samples/test-corpus/pdf (gitignored).
 *
 *   npm run build:corpus
 *
 * The Markdown subset used by corpus documents is deliberately small
 * (headings, paragraphs, bold/italic, lists), so this converts by hand
 * rather than adding a markdown dependency.
 */

import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS_DIR = path.join(ROOT, 'samples/test-corpus/docs')
const OUT_DIR = path.join(ROOT, 'samples/test-corpus/pdf')

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return { meta: {}, body: raw }
  const meta = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { meta, body: raw.slice(match[0].length) }
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Inline markdown: bold, italic (applied after HTML-escaping). */
const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')

/** Block-level markdown → HTML for the corpus subset. */
function markdownToHtml(md) {
  const out = []
  let list = null
  const closeList = () => {
    if (list) { out.push('</ul>'); list = null }
  }
  for (const block of md.split(/\n{2,}/)) {
    const text = block.trim()
    if (!text) continue
    const lines = text.split('\n')
    if (lines.every((l) => /^- /.test(l))) {
      closeList()
      out.push('<ul>', ...lines.map((l) => `<li>${inline(l.slice(2))}</li>`), '</ul>')
    } else if (/^### /.test(text)) {
      closeList(); out.push(`<h3>${inline(text.slice(4))}</h3>`)
    } else if (/^## /.test(text)) {
      closeList(); out.push(`<h2>${inline(text.slice(3))}</h2>`)
    } else if (/^# /.test(text)) {
      closeList(); out.push(`<h1>${inline(text.slice(2))}</h1>`)
    } else {
      closeList(); out.push(`<p>${inline(lines.join(' '))}</p>`)
    }
  }
  closeList()
  return out.join('\n')
}

function documentHtml(meta, body) {
  // The <title> matters: Chromium stamps it into the PDF's Title metadata,
  // which document-lens prefers over the filename at import.
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(meta.title ?? '')}</title><style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt;
         line-height: 1.55; color: #1a1a1a; margin: 0; }
  h1 { font-size: 20pt; line-height: 1.25; margin: 0 0 6pt; }
  h2 { font-size: 13.5pt; margin: 18pt 0 4pt; border-bottom: 0.75pt solid #999;
       padding-bottom: 2pt; }
  h3 { font-size: 12pt; margin: 12pt 0 2pt; }
  p { margin: 0 0 8pt; text-align: justify; }
  ul { margin: 0 0 8pt 18pt; }
  em:first-of-type { color: #8a2222; }
  .masthead { border-bottom: 2.5pt solid #1a1a1a; margin-bottom: 14pt;
              padding-bottom: 6pt; display: flex; justify-content: space-between;
              font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase;
              color: #555; }
</style></head><body>
<div class="masthead"><span>${escapeHtml(meta.company ?? '')}</span><span>${escapeHtml(meta.type ?? '')} · ${escapeHtml(meta.year ?? '')}</span></div>
${markdownToHtml(body)}
</body></html>`
}

async function launchBrowser() {
  try {
    return await chromium.launch()
  } catch {
    // No Playwright-managed Chromium for this playwright-core version —
    // fall back to an installed Google Chrome.
    return await chromium.launch({ channel: 'chrome' })
  }
}

const files = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('._'))
  .sort()
if (files.length === 0) {
  console.error(`No markdown sources found in ${DOCS_DIR}`)
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const browser = await launchBrowser()
const page = await browser.newPage()

for (const file of files) {
  const { meta, body } = parseFrontmatter(readFileSync(path.join(DOCS_DIR, file), 'utf8'))
  await page.setContent(documentHtml(meta, body), { waitUntil: 'load' })
  const outPath = path.join(OUT_DIR, file.replace(/\.md$/, '.pdf'))
  await page.pdf({
    path: outPath,
    format: 'A4',
    margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%; font-size:7.5pt; color:#777; text-align:center; font-family: Georgia, serif;">
      FICTIONAL DOCUMENT — Document Lens test corpus &nbsp;·&nbsp; page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>`,
  })
  console.log(`built ${path.relative(ROOT, outPath)}`)
}

await browser.close()
console.log(`\n${files.length} PDFs written to ${path.relative(ROOT, OUT_DIR)}`)
