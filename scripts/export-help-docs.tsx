/**
 * Render the in-app help (src/pages/Help.tsx) to markdown chapters for the
 * PDF manual. The in-app help is the single source of truth for user
 * documentation; this script → pandoc → typst is the pipeline, driven by
 * manual/build-manual.sh. Output goes to the (gitignored) manual build dir.
 *
 * Run via the bundler (no ts-node needed):
 *   npx esbuild scripts/export-help-docs.tsx --bundle --platform=node \
 *     --format=cjs --jsx=automatic --alias:@=./src \
 *     --outfile=manual/build/export-help.cjs && node manual/build/export-help.cjs
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { TOPICS } from '@/pages/Help'
import { HELP_SCREENSHOTS } from '@/pages/help-screenshots'

const OUT_DIR = 'manual/build/chapters'
// Image paths are written relative to manual/build/ (where manual.typ is
// compiled); build-manual.sh passes --root so typst may read outside it.
const SCREENSHOT_PREFIX = '../../docs/screenshots'

/** Chapter files in manual order; each pulls one or more Help groups. */
const CHAPTERS: Array<{ file: string; title: string; groups: string[]; intro?: string }> = [
  {
    file: 'getting-started.md',
    title: 'Getting Started',
    groups: ['Start here'],
  },
  {
    file: 'project-setup.md',
    title: 'Project Setup',
    groups: ['Setup'],
    intro:
      'A project bundles documents, a keyword list, lenses, and a scoring rule. ' +
      'This chapter covers the Setup tab, where all of that is assembled.',
  },
  {
    file: 'explore.md',
    title: 'Explore — See What the Corpus Contains',
    groups: ['Explore'],
    intro:
      'The Explore workflows answer "what is in these documents?" — which keywords ' +
      'appear where (Coverage), how topics distribute and overlap (Map), what each ' +
      'document actually says (Read), and what vocabulary the corpus itself uses (Discover).',
  },
  {
    file: 'measure.md',
    title: 'Measure — Put Numbers on It',
    groups: ['Measure'],
    intro:
      'The Measure workflows quantify the corpus: rate each document on a rubric ' +
      '(Score), follow a metric across years (Track), and rank documents (Compare).',
  },
  {
    file: 'verify.md',
    title: 'Verify — Check the Evidence Holds Up',
    groups: ['Verify'],
    intro:
      'The Verify workflows stress-test your findings: are keywords used in the ' +
      'right context (Audit), and where does tone run ahead of substance (Gap)?',
  },
  {
    file: 'sharing.md',
    title: 'Sharing & Export',
    groups: ['Sharing & export'],
  },
]

function htmlToMarkdown(html: string): string {
  return execFileSync(
    'pandoc',
    ['-f', 'html', '-t', 'gfm-raw_html', '--wrap=preserve'],
    { input: html, encoding: 'utf-8' }
  )
}

function imageMarkdown(topicId: string): string {
  // Every manifest entry goes in the PDF (the inApp flag only gates the
  // in-app help, where the app itself is already on screen).
  return (HELP_SCREENSHOTS[topicId] ?? [])
    .map((s) => `![${s.caption}](${SCREENSHOT_PREFIX}/${s.file}){width=100%}\n`)
    .join('\n')
}

function markdownForChapter(chapter: (typeof CHAPTERS)[number]): string {
  const topics = TOPICS.filter((t) => chapter.groups.includes(t.group))
  const parts = [`# ${chapter.title}\n`]
  if (chapter.intro) parts.push(`*${chapter.intro}*\n`)
  for (const topic of topics) {
    // Skip the topic heading when it would just repeat the chapter title
    // (e.g. the "Getting Started" chapter's single "Getting started" topic).
    const redundant =
      topics.length === 1 && topic.title.toLowerCase() === chapter.title.toLowerCase()
    if (!redundant) parts.push(`## ${topic.title}\n`)
    const images = imageMarkdown(topic.id)
    if (images) parts.push(images)
    // Topic bodies use <h2> for their own sections; demote one level so the
    // manual's hierarchy reads chapter > topic > section.
    const body = renderToStaticMarkup(<>{topic.render()}</>)
      .replaceAll('<h2', '<h3')
      .replaceAll('</h2>', '</h3>')
    parts.push(htmlToMarkdown(body))
  }
  return parts.join('\n')
}

mkdirSync(OUT_DIR, { recursive: true })
const banner =
  '<!-- GENERATED from src/pages/Help.tsx by scripts/export-help-docs.tsx — do not edit by hand. -->\n\n'
for (const chapter of CHAPTERS) {
  const md = banner + markdownForChapter(chapter)
  writeFileSync(`${OUT_DIR}/${chapter.file}`, md)
  console.log(`  wrote ${OUT_DIR}/${chapter.file}`)
}
console.log(`Exported ${CHAPTERS.length} chapters from ${TOPICS.length} help topics.`)
