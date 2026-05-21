/**
 * Help — in-app docs, organised by workflow + feature.
 *
 * Single-file by design: each topic is a small JSX component below.
 * Easier to maintain in one place than 12 separate files; the page is
 * already split by topic via the sidebar nav.
 */

import { useState, type ReactNode } from 'react'
import {
  HelpCircle,
  Compass,
  Settings as SettingsIcon,
  Grid3x3,
  Layers,
  Award,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Package,
  FileText,
  ScatterChart,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Topic {
  id: string
  title: string
  group: 'Start here' | 'Setup' | 'Workflows' | 'Sharing & export'
  icon: typeof HelpCircle
  render: () => ReactNode
}

const TOPICS: Topic[] = [
  { id: 'getting-started', title: 'Getting started', group: 'Start here', icon: Compass, render: GettingStarted },
  { id: 'setup', title: 'Setup tab', group: 'Setup', icon: SettingsIcon, render: SetupTopic },
  { id: 'coverage', title: 'Coverage', group: 'Workflows', icon: Grid3x3, render: CoverageTopic },
  { id: 'map', title: 'Map', group: 'Workflows', icon: Layers, render: MapTopic },
  { id: 'score', title: 'Score', group: 'Workflows', icon: Award, render: ScoreTopic },
  { id: 'track', title: 'Track', group: 'Workflows', icon: TrendingUp, render: TrackTopic },
  { id: 'compare', title: 'Compare', group: 'Workflows', icon: BarChart3, render: CompareTopic },
  { id: 'audit', title: 'Audit', group: 'Workflows', icon: AlertTriangle, render: AuditTopic },
  { id: 'discover', title: 'Discover', group: 'Workflows', icon: Sparkles, render: DiscoverTopic },
  { id: 'read', title: 'Read', group: 'Workflows', icon: BookOpen, render: ReadTopic },
  { id: 'gap', title: 'Gap', group: 'Workflows', icon: ScatterChart, render: GapTopic },
  { id: 'paper-bundle', title: 'Paper-ready bundle', group: 'Sharing & export', icon: FileText, render: PaperBundleTopic },
  { id: 'project-bundle', title: 'Project bundle (.lens)', group: 'Sharing & export', icon: Package, render: ProjectBundleTopic },
]

const GROUPS: Topic['group'][] = ['Start here', 'Setup', 'Workflows', 'Sharing & export']

export function Help() {
  const [activeId, setActiveId] = useState<string>(TOPICS[0].id)
  const active = TOPICS.find((t) => t.id === activeId) ?? TOPICS[0]

  return (
    <div className="flex h-full">
      <nav className="w-60 shrink-0 border-r border-border overflow-y-auto py-6 px-3 space-y-5">
        <div className="px-2">
          <h1 className="font-display text-lg font-medium tracking-tight">Help</h1>
          <p className="text-xs text-muted-foreground italic mt-0.5">Show me how.</p>
        </div>
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {group}
            </div>
            <ul>
              {TOPICS.filter((t) => t.group === group).map((t) => {
                const Icon = t.icon
                const isActive = t.id === activeId
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left',
                        isActive ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto py-10 px-12">
        <article className="max-w-3xl prose-doc">
          <h1 className="font-display text-2xl font-medium tracking-tight mb-6">{active.title}</h1>
          {active.render()}
        </article>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared helpers (typography wrappers)
// ---------------------------------------------------------------------------

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground/90 mb-4">{children}</p>
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-lg font-medium tracking-tight mt-8 mb-3">{children}</h2>
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="text-sm leading-relaxed text-foreground/90 mb-4 list-disc pl-5 space-y-1.5">{children}</ul>
}

function Code({ children }: { children: ReactNode }) {
  return <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{children}</code>
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <aside className="text-xs border-l-2 border-foreground/30 bg-muted/40 rounded-r px-3 py-2 mb-4">
      {children}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Topic content
// ---------------------------------------------------------------------------

function GettingStarted() {
  return (
    <>
      <P>
        Document Lens is a workspace for keyword analysis of document corpora. The
        intended workflow: assemble a <strong>project</strong>, then walk the
        nine workflow tabs (Coverage → Map → Score → Track → Compare → Audit →
        Discover → Read) to answer different questions about that project.
      </P>
      <H2>Your first project</H2>
      <P>
        From the empty <strong>Projects</strong> page, click <em>Create your first project</em>{' '}
        to launch the three-step wizard. Defaults are pre-loaded for sustainability research:
        the SDG keyword list, three lenses (SDG, Pillar, Function), and the 5-level
        Wedding Cake Score. Pick documents (or skip and add them from the Library
        later), confirm the defaults, and you'll land on the project's <strong>Setup</strong>{' '}
        tab with everything wired up.
      </P>
      <H2>The data model in one paragraph</H2>
      <P>
        Each <strong>keyword</strong> carries a <strong>polarity</strong>: positive (signals
        delivery — "carbon reduction") or counter (signals greenwashing — "performative
        disclosure"). Keywords carry tags against keyword-attached lenses (SDG, Pillar).
        Documents carry section-level tags against document-context lenses (Function — what
        kind of activity each section describes). The two-axis Map and Wedding Cake Score
        work by intersecting these tag sets.
      </P>
      <H2>What if I'm not doing sustainability?</H2>
      <P>
        Pick <em>Other</em> in the wizard's focus step. The project will be created empty;
        head to <strong>Keywords</strong> and <strong>Lenses</strong> in the left nav to build
        your own taxonomy, then to Settings to define a scoring rule.
      </P>
    </>
  )
}

function SetupTopic() {
  return (
    <>
      <P>
        Setup is where a project's components live: <strong>documents</strong>,{' '}
        <strong>keyword list</strong>, active <strong>lenses</strong>,{' '}
        <strong>Function classification</strong>, and the <strong>scoring rule</strong>.
        Every workflow tab reads from this configuration.
      </P>
      <H2>Documents</H2>
      <P>
        <em>Add documents from Library</em> opens a picker over your global Library — docs
        are stored once and can be attached to many projects. The picker has an
        <em> Import new… </em>button so you can import fresh files into the Library and
        attach them in one go.
      </P>
      <P>
        If a document arrived via project-bundle import without its source file (see{' '}
        <em>Project bundle</em> topic), it appears with a yellow <em>Source missing</em>{' '}
        chip. Click <em>Locate file…</em> to point at the file on disk; we hash-verify
        the file you pick to be sure it's the same one (otherwise extracted text +
        sections + tags would no longer match).
      </P>
      <H2>Keywords + Lenses</H2>
      <P>
        Pick the active keyword list (one per project) and the active lenses (multiple).
        For sustainability projects you typically want <Code>SDGs (Universities)</Code>{' '}
        as the list and the three built-in lenses (SDG, Pillar, Function) all active.
      </P>
      <H2>Function classification</H2>
      <P>
        For Map's two-axis matrix and Score's full Wedding Cake mode, each document
        section needs to be tagged with a Function value. Click <em>Run classification</em>{' '}
        to send each section's text to the embedding model and assign the closest Function.
        It's deterministic per model version and runs once — re-run only if you've added
        documents.
      </P>
      <Tip>
        <strong>Bundle export</strong> lives in the Setup tab header, top right. See the{' '}
        <em>Project bundle</em> topic.
      </Tip>
      <H2>Scoring rule</H2>
      <P>
        Pick which scoring rule to apply. The seeded one (5-level Wedding Cake Score)
        counts how many of four Functions deliver all three required Pillars. Custom
        rules are built in <strong>Settings</strong>.
      </P>
    </>
  )
}

function CoverageTopic() {
  return (
    <>
      <P><em>Which keywords appear where?</em></P>
      <P>
        Coverage is the first tab to open after you've set up a project. It computes
        per-document × per-keyword match counts and displays them as a heatmap, plus
        a roll-up by lens value (e.g. by Pillar — Biosphere / Society / Economy) to
        give you the framework-level view.
      </P>
      <H2>Stacked positive + counter heatmaps</H2>
      <P>
        When the active keyword list has both polarities, Coverage shows two heatmaps
        one above the other (positive then counter). Honest greenwashing detection
        needs both — a doc with strong positive coverage but heavy counter-keyword use
        is the canonical "performative disclosure" pattern.
      </P>
      <Tip>
        Coverage is purely local — no backend call. It runs whenever you open the tab
        and re-runs in milliseconds.
      </Tip>
    </>
  )
}

function MapTopic() {
  return (
    <>
      <P><em>How does each document distribute across two lens axes?</em></P>
      <P>
        Map is a per-document grid showing how that document's keyword usage spreads
        across two axes — typically <strong>SDG × Function</strong>. Each cell is the
        number of (positive) keyword hits in sections classified as that Function for
        keywords tagged with that SDG.
      </P>
      <P>
        Use Map to verify the Wedding Cake hypothesis at the per-document level: does
        this report deliver SDG 13 (Climate Action) through Operations, or only through
        Awareness? Empty cells across a Function row mean the doc isn't delivering any
        SDG via that activity type.
      </P>
      <P>
        Map needs Function classification (see Setup). Without it, the second axis is
        blank.
      </P>
    </>
  )
}

function ScoreTopic() {
  return (
    <>
      <P><em>A single number per document.</em></P>
      <P>
        Score applies the project's scoring rule to each document. The default rule
        is <strong>5-level Wedding Cake Score</strong> (levels 0–4): of four
        organisational Functions, how many cover all three required Pillars
        (Biosphere, Society, Economy)?
      </P>
      <H2>Full mode vs fallback</H2>
      <P>
        When all documents in the project are Function-classified, Score runs in
        <em> full mode</em> using the two-axis matrix. When classification is incomplete
        (or the active rule doesn't reference Function), it falls back to{' '}
        <strong>v1 Pillar coverage</strong>: how many required Pillars does each doc
        mention positively. The header banner makes the active mode explicit.
      </P>
      <H2>Per-document scatter overlay</H2>
      <P>
        The chart shows the per-document points alongside the average line so you can
        see the distribution behind each level — useful for spotting outliers or
        bimodal corpora.
      </P>
    </>
  )
}

function TrackTopic() {
  return (
    <>
      <P><em>How does the metric move year-over-year?</em></P>
      <P>
        Track aggregates a chosen <strong>measure</strong> (match count, distinct
        keywords, positive − counter, or score) across the corpus by year. Useful
        for "has disclosure improved over the last decade?" type questions.
      </P>
      <H2>Group by company / sector</H2>
      <P>
        The default series is one line for the whole corpus. Switching <em>Group by</em>{' '}
        to Company or Sector splits the line — you get one trend per company, palette-
        coloured, so you can compare "is BHP improving faster than Rio?" directly.
      </P>
      <H2>Polarity</H2>
      <P>
        For match-based measures, the Polarity selector limits to positive or counter
        keywords. Tracking both lines side-by-side (run with each polarity, screenshot,
        compare) is the cheap "greenwashing trend" view; pos-minus-counter rolls them
        into one line.
      </P>
      <Tip>
        The <em>Export paper bundle</em> button on Track ships your current chart as a
        PNG plus the underlying data — drop straight into a paper. See the{' '}
        <em>Paper-ready bundle</em> topic.
      </Tip>
    </>
  )
}

function CompareTopic() {
  return (
    <>
      <P><em>Rank documents on the chosen metric.</em></P>
      <P>
        Compare is "Track without the time dimension" — same per-document measures,
        ranked by value rather than aggregated by year. Headline use case: "which
        report does best on the Wedding Cake Score?"
      </P>
      <H2>Per-keyword filter</H2>
      <P>
        For match-count and distinct-keywords metrics, the Keyword selector narrows
        the ranking to a single keyword. Lets you ask "which doc talks most about{' '}
        <em>circular economy</em>?" directly.
      </P>
      <H2>Filters + colour-by</H2>
      <P>
        Year range, company, and sector multi-select filters narrow the ranked set
        without changing the metric. Colour bars by Company / Year / Sector to spot
        clusters visually.
      </P>
    </>
  )
}

function AuditTopic() {
  return (
    <>
      <P><em>Is each keyword being used in the right context?</em></P>
      <P>
        The methodology calls this the "contextual relevance check": if a keyword
        appears in a section whose semantic domain doesn't match the keyword's
        intended Function, that's a signal worth investigating.
      </P>
      <H2>Anomalies</H2>
      <P>
        Sends each document to the backend's <Code>/semantic/structural-mismatch</Code>{' '}
        endpoint, which classifies every sentence + every parent section and flags
        sentences whose own domain disagrees with their parent's. We surface only the
        keyword-bearing flagged sentences. Use the threshold to trade noise for
        sensitivity.
      </P>
      <P>
        Per-doc responses are cached by content hash + lens config + threshold. The
        first run on a project is slow (sentence embedding is expensive); re-runs with
        the same inputs are instant.
      </P>
      <H2>Confirmations</H2>
      <P>
        The inverse view: keyword usages that <em>did</em> land in their expected-Function
        section. Defensible "yes, this is being used in the right context" evidence
        for a sceptical reviewer. No backend call — uses the cached Function
        classifications from Setup directly. Confidence (how strongly the section
        matched the Function) drives the severity bucket and is shown as a percentage
        on the badge (e.g. <Code>medium · 38%</Code>).
      </P>
    </>
  )
}

function DiscoverTopic() {
  return (
    <>
      <P><em>What phrases / synonyms is the corpus using that you should know about?</em></P>
      <H2>Phrases (n-grams)</H2>
      <P>
        Extracts frequent 2- and 3-word phrases from the corpus, ranked by count and
        document spread. Useful for finding domain-specific terminology you might
        want to add as keywords. The <em>+ Keyword</em> button on each row adds the
        phrase straight to the active list as a positive keyword.
      </P>
      <H2>Synonyms</H2>
      <P>
        For each enabled keyword, ranks corpus n-grams by <strong>semantic similarity</strong>{' '}
        (sentence-embedding cosine — meaning, not letters). High similarity = the
        candidate is likely a synonym worth tracking. Two ways to keep one:
      </P>
      <UL>
        <li><strong>Synonym</strong> — attaches the candidate as a synonym of the parent keyword (preserves provenance, counts in Coverage automatically).</li>
        <li><strong>Keyword</strong> — adds it as a first-class entry on the list with the same polarity. Useful for counter-keyword discovery — promote a candidate counter-narrative term to its own keyword rather than burying it as a synonym.</li>
      </UL>
      <Tip>
        If Synonyms returns "no candidates above the similarity threshold", drop{' '}
        <em>Min similarity</em> to 0.3 and bump <em>Top per keyword</em> to 12+.
        Small corpora (a few documents) genuinely have less to surface.
      </Tip>
    </>
  )
}

function ReadTopic() {
  return (
    <>
      <P><em>What does each document actually say about a topic?</em></P>
      <P>
        Read is the concordance view: pick a document and a keyword, see every match
        with surrounding context (50 / 100 / 250 words). The keyword dropdown is
        filtered to ones that actually appear in the picked doc, so you don't pick a
        keyword and see "no matches".
      </P>
      <H2>Locating the passage in the source PDF</H2>
      <P>
        Each match card has four navigation aids, in increasing reliability:
      </P>
      <UL>
        <li><strong>Preview</strong> — opens the source PDF in an in-app modal at the right page (Chromium's built-in PDFium viewer). Hit ⌘F and paste the keyword.</li>
        <li><strong>Open at page N</strong> — opens in your OS PDF viewer at the right page via <Code>file://…#page=N</Code>. Preview / Acrobat honour the fragment; viewers that don't, gracefully open at page 1.</li>
        <li><strong>Open source file</strong> — opens at page 1 in your OS viewer.</li>
        <li><strong>Copy phrase</strong> — three-word snippet on your clipboard. Paste into any viewer's Find. Three words is short enough to dodge the footnote / header noise that the extractor sometimes inlines.</li>
      </UL>
      <H2>Section labels</H2>
      <P>
        When a match is in a classified document, the card shows the containing section
        as <Code>§ N/M</Code> plus the first ~80 chars of that section's text — usually
        the heading, so you can tell what part of the document you're looking at without
        opening the PDF.
      </P>
    </>
  )
}

function GapTopic() {
  return (
    <>
      <P><em>Where does the tone run ahead of the substance?</em></P>
      <P>
        Gap plots each document, section, and keyword in{' '}
        <strong>tone (sentiment) × substance (keyword polarity)</strong> space.
        Distance above the 1:1 diagonal is the "talk exceeds walk" measure —
        the gap between what is said and what is delivered.
      </P>
      <P>
        The gap is more informative than either axis alone, for a specific
        reason: in corporate disclosure the tone is uniformly positive, so
        absolute sentiment barely varies. What varies meaningfully is how far
        the tone runs ahead of (or behind) the substance. Subtracting one axis
        from the other cancels out the baseline positivity that makes raw
        sentiment useless here. You're left with a residual: tone not justified
        by substance.
      </P>
      <H2>Quadrant guide</H2>
      <table className="text-xs w-full border-collapse mb-4">
        <thead>
          <tr>
            <th className="border border-border px-2 py-1 text-left text-muted-foreground font-medium"></th>
            <th className="border border-border px-2 py-1 text-left text-muted-foreground font-medium">High substance (delivery)</th>
            <th className="border border-border px-2 py-1 text-left text-muted-foreground font-medium">Low substance (counter / sparse)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-border px-2 py-1 font-medium">High tone</td>
            <td className="border border-border px-2 py-1">aligned — genuine good news</td>
            <td className="border border-border px-2 py-1">talk &gt; walk → performative / greenwashing</td>
          </tr>
          <tr>
            <td className="border border-border px-2 py-1 font-medium">Low tone</td>
            <td className="border border-border px-2 py-1">walk &gt; talk → understated / candid</td>
            <td className="border border-border px-2 py-1">aligned — honest about gaps</td>
          </tr>
        </tbody>
      </table>
      <H2>Polarity vs sentiment</H2>
      <P>
        These two axes are orthogonal and must not be conflated:
      </P>
      <UL>
        <li><strong>Polarity</strong> is a property of the <em>keyword</em> — curated by the researcher: positive keywords signal delivery, counter keywords signal performative vocabulary.</li>
        <li><strong>Sentiment</strong> is a property of the <em>text</em> — inferred by the model from the tone of the surrounding prose.</li>
      </UL>
      <P>
        Greenwashing is positive in tone but hollow in substance, so the gap between them is the signal.
      </P>
      <Tip>
        Gap is a coarse signal for surfacing passages that warrant closer reading —
        not a verdict on a document's integrity. Use{' '}
        <strong>Read</strong> to inspect the flagged passages in context.
      </Tip>
    </>
  )
}

function PaperBundleTopic() {
  return (
    <>
      <P>
        A ZIP designed to drop straight into an academic paper. Captures the{' '}
        <strong>current Track view</strong>, not the whole project.
      </P>
      <H2>What's in it</H2>
      <UL>
        <li><Code>chart.png</Code> — the chart you're looking at, rendered at 2× for retina-ish quality</li>
        <li><Code>methodology.md</Code> — auto-generated configuration blurb (measure, polarity, filters, scoring rule)</li>
        <li><Code>data.csv</Code> — the pivoted year × series matrix</li>
        <li><Code>documents.csv</Code> — the contributing documents with year / company / sector</li>
        <li><Code>per-document.csv</Code> — per-doc scores (only when measure = score)</li>
      </UL>
      <P>
        Saved via a native file dialog. No backend round-trip — composed client-side
        from the Track result + a snapshot of the rendered chart SVG.
      </P>
      <Tip>
        This is different from the <em>project bundle</em> (.lens). Paper-ready is for
        publication; project bundle is for sharing the whole project with a colleague.
      </Tip>
    </>
  )
}

function ProjectBundleTopic() {
  return (
    <>
      <P>
        A <Code>.lens</Code> file containing the full project state — for
        researcher-to-researcher sharing. Local-first, single-user, no auth or
        central DB required: export, email, the recipient imports.
      </P>
      <H2>Export</H2>
      <P>
        Setup tab → top-right <em>Export bundle</em> button. Writes the project's
        documents (metadata + extracted text + per-page text + sections + tags),
        keyword list, lenses, scoring rule, and (by default) the original source
        files into a single ZIP.
      </P>
      <H2>Import</H2>
      <P>
        Projects page → <em>Import bundle</em> button (or the same option on the empty
        state). Shows a preview first: counts of what will be created vs reused, plus
        warnings (e.g. "no source files in this bundle"). Click <em>Import as new
        project</em> to apply.
      </P>
      <H2>How identity is handled</H2>
      <UL>
        <li><strong>Documents</strong> are matched by file content hash. Same PDF already in your Library → the existing doc is reused. New PDF + bundle includes the file → written to your app data folder. New PDF + no file in the bundle → metadata-only doc, marked <em>Source missing</em> in Setup until you locate the file.</li>
        <li><strong>Built-in lenses</strong> (SDG, Pillar, Function) and the seeded SDG keyword list and Wedding Cake scoring rule are matched by stable identifier and reused — your sustainability defaults are never duplicated by an import.</li>
        <li><strong>Custom lenses, lists, and rules</strong> get fresh IDs. Name collisions get a <Code>(imported)</Code> suffix; you can rename anytime.</li>
        <li><strong>Project name</strong> collisions also get the suffix. Two researchers can each have their own "Acme 2024 Sustainability" without overwriting.</li>
      </UL>
      <H2>Re-linking missing source files</H2>
      <P>
        When a bundle arrives without source files, the docs analyse fine (Coverage,
        Score, Track, Read concordance, Audit Confirmations all work from cached
        text), but Preview / Open in viewer is unavailable. Setup shows a yellow{' '}
        <em>Source missing</em> chip on each affected doc; click <em>Locate file…</em>{' '}
        and pick the file on disk. We hash-verify it matches before re-linking, so you
        can't accidentally relink the wrong file and silently corrupt the analysis.
      </P>
    </>
  )
}
