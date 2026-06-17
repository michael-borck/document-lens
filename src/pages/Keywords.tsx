/**
 * Keywords — list management + per-keyword + per-synonym CRUD.
 *
 * Two-pane layout:
 *   left  — all keyword lists (built-in + custom)
 *   right — selected list's keywords with toggle / edit / delete +
 *           expandable per-keyword synonym sub-list
 *
 * The Discover tab can already create keywords by promoting n-grams /
 * synonym candidates. This page is for everything else: top-down list
 * grooming, polarity flipping, manual additions, synonym pruning,
 * deleting custom lists.
 */

import { useEffect, useState } from 'react'
import {
  Tag,
  Plus,
  Trash2,
  Lock,
  X,
  ChevronRight,
  ChevronDown,
  Pencil,
  Check,
  Upload,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/Loading'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import {
  listKeywordLists,
  createKeywordList,
  deleteKeywordList,
  listKeywords,
  createKeyword,
  updateKeyword,
  setKeywordEnabled,
  deleteKeyword,
  listSynonyms,
  createSynonym,
  deleteSynonym,
  setSynonymEnabled,
  listExclusions,
  createExclusion,
  deleteExclusion,
  listAntonymKeywords,
  createAndLinkAntonym,
  unlinkAntonym,
} from '@/services/keyword-lists'
import {
  keywordListToCsv,
  csvToNewKeywordList,
  suggestKeywordCsvName,
} from '@/services/keyword-csv'
import { toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import type {
  KeywordList,
  Keyword,
  Synonym,
  KeywordExclusion,
  KeywordPolarity,
} from '@/types/data'

type PolarityFilter = KeywordPolarity | 'all'

export function Keywords() {
  const [lists, setLists] = useState<KeywordList[] | null>(null)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [newListOpen, setNewListOpen] = useState(false)
  const [pendingDeleteList, setPendingDeleteList] = useState<KeywordList | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const refresh = async () => {
    const fresh = await listKeywordLists()
    setLists(fresh)
    if (selectedListId === null && fresh.length > 0) {
      setSelectedListId(fresh[0].id)
    }
  }

  const handleListCreated = (list: KeywordList) => {
    refresh()
    setSelectedListId(list.id)
  }

  const handleImportCsv = async () => {
    const electron = window.electron
    if (!electron) return
    const dialog = await electron.openFileDialog({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (dialog.canceled || dialog.filePaths.length === 0) return
    const path = dialog.filePaths[0]
    try {
      const buf = await electron.readFile(path)
      const text = new TextDecoder('utf-8').decode(buf)
      const base = (path.split(/[\\/]/).pop() ?? 'keywords.csv').replace(/\.csv$/i, '')
      const s = await csvToNewKeywordList(text, base)
      await refresh()
      setSelectedListId(s.listId)

      const extras: string[] = []
      if (s.synonymsCreated) extras.push(`${s.synonymsCreated} synonyms`)
      if (s.tagsApplied) extras.push(`${s.tagsApplied} tags`)
      const headline =
        `Imported ${s.keywordsCreated} keyword${s.keywordsCreated === 1 ? '' : 's'} into "${s.listName}"` +
        (extras.length ? ` (${extras.join(', ')})` : '')

      const warnings: string[] = []
      if (s.ignoredColumns.length) warnings.push(`Ignored unknown columns: ${s.ignoredColumns.join(', ')}.`)
      if (s.unmatchedTagValues.length) {
        const shown = s.unmatchedTagValues.slice(0, 5).join(', ')
        warnings.push(
          `Couldn't match ${s.unmatchedTagValues.length} tag value${s.unmatchedTagValues.length === 1 ? '' : 's'}: ${shown}${s.unmatchedTagValues.length > 5 ? '…' : ''}.`
        )
      }
      if (warnings.length) toast.info(headline, warnings.join(' '))
      else toast.success(headline)
    } catch (err) {
      toast.error(`CSV import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleConfirmDeleteList = async () => {
    if (!pendingDeleteList) return
    await deleteKeywordList(pendingDeleteList.id)
    toast.success(`Deleted list "${pendingDeleteList.name}"`)
    if (selectedListId === pendingDeleteList.id) setSelectedListId(null)
    setPendingDeleteList(null)
    await refresh()
  }

  if (lists === null) {
    return <Loading />
  }

  const selected = lists.find((l) => l.id === selectedListId) ?? null
  const builtIn = lists.filter((l) => l.type === 'built-in')
  const custom = lists.filter((l) => l.type !== 'built-in')

  return (
    <div className="px-8 py-10 max-w-7xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">Keywords</h1>
          <p className="text-muted-foreground italic mt-1">What are you looking for?</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleImportCsv} className="gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => setNewListOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New keyword list
          </Button>
        </div>
      </header>

      {lists.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-12 w-12" />}
          title="No keyword lists yet"
          description="A keyword list is a curated set of terms a project searches for. The seeded SDG list is normally pre-loaded; create custom lists for non-sustainability research."
          action={
            <Button onClick={() => setNewListOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create your first list
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-12 gap-6">
          <ListSidebar
            builtIn={builtIn}
            custom={custom}
            selectedId={selectedListId}
            onSelect={setSelectedListId}
            onAskDelete={setPendingDeleteList}
          />
          <div className="col-span-9">
            {selected ? (
              <KeywordsPane list={selected} />
            ) : (
              <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
                Pick a list on the left.
              </div>
            )}
          </div>
        </div>
      )}

      <NewListDialog
        open={newListOpen}
        onOpenChange={setNewListOpen}
        onCreated={handleListCreated}
      />

      <ConfirmDialog
        open={pendingDeleteList !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteList(null) }}
        title={`Delete list "${pendingDeleteList?.name ?? ''}"?`}
        description={
          <>
            Removes the list, all its keywords, and all their synonyms.
            Projects that reference this list will lose their active keyword
            list (other lists stay attached). <strong>Built-in lists cannot
            be deleted.</strong>
          </>
        }
        confirmLabel="Delete list"
        destructive
        onConfirm={handleConfirmDeleteList}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Left sidebar: keyword lists
// ---------------------------------------------------------------------------

function ListSidebar({
  builtIn,
  custom,
  selectedId,
  onSelect,
  onAskDelete,
}: {
  builtIn: KeywordList[]
  custom: KeywordList[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAskDelete: (list: KeywordList) => void
}) {
  return (
    <nav className="col-span-3 space-y-5">
      {builtIn.length > 0 && (
        <Group label="Built-in">
          {builtIn.map((l) => (
            <ListRow
              key={l.id}
              list={l}
              isSelected={l.id === selectedId}
              isBuiltin
              onSelect={() => onSelect(l.id)}
            />
          ))}
        </Group>
      )}
      <Group label="Custom">
        {custom.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-2 py-1">
            No custom lists yet.
          </div>
        ) : (
          custom.map((l) => (
            <ListRow
              key={l.id}
              list={l}
              isSelected={l.id === selectedId}
              isBuiltin={false}
              onSelect={() => onSelect(l.id)}
              onAskDelete={() => onAskDelete(l)}
            />
          ))
        )}
      </Group>
    </nav>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  )
}

function ListRow({
  list,
  isSelected,
  isBuiltin,
  onSelect,
  onAskDelete,
}: {
  list: KeywordList
  isSelected: boolean
  isBuiltin: boolean
  onSelect: () => void
  onAskDelete?: () => void
}) {
  return (
    <li className="group">
      <div
        className={cn(
          'flex items-center gap-2 rounded transition-colors',
          isSelected ? 'bg-muted font-medium' : 'hover:bg-muted/40'
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-left min-w-0"
        >
          <span className="truncate">{list.name}</span>
          {isBuiltin && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </button>
        {!isBuiltin && onAskDelete && (
          <button
            type="button"
            onClick={onAskDelete}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 py-1.5 text-muted-foreground hover:text-destructive transition-colors"
            title="Delete list"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Right pane: keywords for the selected list
// ---------------------------------------------------------------------------

function KeywordsPane({ list }: { list: KeywordList }) {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [polarityFilter, setPolarityFilter] = useState<PolarityFilter>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingDeleteKw, setPendingDeleteKw] = useState<Keyword | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Reset transient state when switching lists.
  useEffect(() => {
    setSearch('')
    setExpandedId(null)
    setEditingId(null)
    setPolarityFilter('all')
  }, [list.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listKeywords(list.id).then((rows) => {
      if (!cancelled) {
        setKeywords(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [list.id])

  const refresh = async () => {
    setKeywords(await listKeywords(list.id))
  }

  const filtered = keywords.filter((k) => {
    if (polarityFilter !== 'all' && k.polarity !== polarityFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!k.text.toLowerCase().includes(q) && !(k.notes ?? '').toLowerCase().includes(q)) {
        return false
      }
    }
    return true
  })

  const handleAddKeyword = async (text: string, polarity: KeywordPolarity) => {
    if (!text.trim()) return
    await createKeyword({ listId: list.id, text: text.trim(), polarity, enabled: true })
    await refresh()
    toast.success(`Added "${text.trim()}"`)
  }

  const handleToggle = async (kw: Keyword) => {
    await setKeywordEnabled(kw.id, !kw.enabled)
    await refresh()
  }

  const handleDelete = async () => {
    if (!pendingDeleteKw) return
    await deleteKeyword(pendingDeleteKw.id)
    setPendingDeleteKw(null)
    await refresh()
    if (expandedId === pendingDeleteKw.id) setExpandedId(null)
  }

  const handleSaveEdit = async (id: string, patch: { text?: string; polarity?: KeywordPolarity; notes?: string | null }) => {
    await updateKeyword(id, patch)
    setEditingId(null)
    await refresh()
  }

  const handleExportCsv = async () => {
    const electron = window.electron
    if (!electron) return
    try {
      const csv = await keywordListToCsv(list.id)
      const dialog = await electron.saveFileDialog({
        defaultPath: suggestKeywordCsvName(list.name),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (dialog.canceled || !dialog.filePath) return
      await electron.writeFile(dialog.filePath, csv)
      toast.success(`Exported "${list.name}" to ${dialog.filePath}`)
    } catch (err) {
      toast.error(`CSV export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const counts = {
    all: keywords.length,
    positive: keywords.filter((k) => k.polarity === 'positive').length,
    counter: keywords.filter((k) => k.polarity === 'counter').length,
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl font-medium">{list.name}</h2>
            {list.type === 'built-in' && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase text-muted-foreground border border-border rounded px-1.5 py-0.5">
                <Lock className="h-2.5 w-2.5" />
                Built-in
              </span>
            )}
          </div>
          {list.description && (
            <p className="text-sm text-muted-foreground italic mt-0.5">{list.description}</p>
          )}
          {list.source && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Source: {list.source}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="gap-1.5 shrink-0"
          title="Export this list to a CSV you can edit in a spreadsheet and re-import"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <PolarityFilterPills value={polarityFilter} counts={counts} onChange={setPolarityFilter} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keywords or notes…"
          className="flex-1 max-w-xs"
        />
        <div className="flex-1" />
        <AddKeywordInline onAdd={handleAddKeyword} />
      </div>

      {loading ? (
        <Loading label="Loading keywords…" className="py-6" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={keywords.length === 0 ? 'No keywords' : 'No matches'}
          description={
            keywords.length === 0
              ? 'Add your first keyword above, or import from CSV (coming soon).'
              : 'Adjust the polarity filter or clear the search.'
          }
        />
      ) : (
        <ul className="border border-border rounded-md divide-y divide-border">
          {filtered.map((kw) => (
            <KeywordRow
              key={kw.id}
              keyword={kw}
              isExpanded={expandedId === kw.id}
              isEditing={editingId === kw.id}
              onToggleExpand={() => setExpandedId(expandedId === kw.id ? null : kw.id)}
              onToggleEnabled={() => handleToggle(kw)}
              onAskDelete={() => setPendingDeleteKw(kw)}
              onStartEdit={() => setEditingId(kw.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(patch) => handleSaveEdit(kw.id, patch)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDeleteKw !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteKw(null) }}
        title={`Delete "${pendingDeleteKw?.text ?? ''}"?`}
        description="Removes the keyword and all its synonyms. Projects using this list will no longer search for this term."
        confirmLabel="Delete keyword"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}

function PolarityFilterPills({
  value,
  counts,
  onChange,
}: {
  value: PolarityFilter
  counts: { all: number; positive: number; counter: number }
  onChange: (v: PolarityFilter) => void
}) {
  const opts: Array<{ key: PolarityFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'positive', label: 'Positive', count: counts.positive },
    { key: 'counter', label: 'Counter', count: counts.counter },
  ]
  return (
    <div className="flex items-center gap-1 text-xs border border-border rounded-md p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'px-2 py-1 rounded transition-colors',
            value === o.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
          )}
        >
          {o.label} <span className="tabular-nums">({o.count})</span>
        </button>
      ))}
    </div>
  )
}

function AddKeywordInline({
  onAdd,
}: {
  onAdd: (text: string, polarity: KeywordPolarity) => void | Promise<void>
}) {
  const [text, setText] = useState('')
  const [polarity, setPolarity] = useState<KeywordPolarity>('positive')
  const submit = async () => {
    if (!text.trim()) return
    await onAdd(text, polarity)
    setText('')
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="New keyword text…"
        className="w-56 h-8"
      />
      <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
        <SelectTrigger className="w-28 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="positive">Positive</SelectItem>
          <SelectItem value="counter">Counter</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={!text.trim()}
        className="h-8 gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Keyword row (collapsed + expanded synonym sub-list)
// ---------------------------------------------------------------------------

function KeywordRow({
  keyword,
  isExpanded,
  isEditing,
  onToggleExpand,
  onToggleEnabled,
  onAskDelete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  keyword: Keyword
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onToggleEnabled: () => void | Promise<void>
  onAskDelete: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (patch: { text?: string; polarity?: KeywordPolarity; notes?: string | null }) => void | Promise<void>
}) {
  return (
    // content-visibility lets the browser skip layout/paint for off-screen
    // rows — the default SDG list is ~430 keywords, so this keeps scroll and
    // filter smooth without a virtualization dependency. contain-intrinsic-size
    // reserves an estimated collapsed-row height so the scrollbar stays stable.
    <li className="group [content-visibility:auto] [contain-intrinsic-size:auto_44px]">
      {isEditing ? (
        <KeywordEditRow keyword={keyword} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-muted-foreground hover:text-foreground"
            title={isExpanded ? 'Collapse' : 'Show synonyms & exclusions'}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <Checkbox
            checked={keyword.enabled}
            onCheckedChange={() => onToggleEnabled()}
            title={keyword.enabled ? 'Enabled in projects' : 'Disabled — projects skip this keyword'}
          />
          <div className="flex-1 min-w-0">
            <div className={cn('text-sm font-medium truncate', !keyword.enabled && 'text-muted-foreground line-through')}>
              {keyword.text}
            </div>
            {keyword.notes && (
              <div className="text-xs text-muted-foreground truncate">{keyword.notes}</div>
            )}
          </div>
          <span className={cn(
            'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border',
            keyword.polarity === 'positive'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-300 dark:border-yellow-800'
          )}>
            {keyword.polarity}
          </span>
          <button
            type="button"
            onClick={onStartEdit}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Edit keyword"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onAskDelete}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Delete keyword"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {isExpanded && !isEditing && (
        <>
          <SynonymsSubList keywordId={keyword.id} />
          <ExclusionsSubList keywordId={keyword.id} />
          {keyword.polarity === 'positive' && (
            <AntonymsSubList keywordId={keyword.id} listId={keyword.listId} />
          )}
        </>
      )}
    </li>
  )
}

function KeywordEditRow({
  keyword,
  onCancel,
  onSave,
}: {
  keyword: Keyword
  onCancel: () => void
  onSave: (patch: { text?: string; polarity?: KeywordPolarity; notes?: string | null }) => void | Promise<void>
}) {
  const [text, setText] = useState(keyword.text)
  const [polarity, setPolarity] = useState<KeywordPolarity>(keyword.polarity)
  const [notes, setNotes] = useState(keyword.notes ?? '')

  const submit = async () => {
    const trimmedText = text.trim()
    if (!trimmedText) return
    await onSave({
      text: trimmedText !== keyword.text ? trimmedText : undefined,
      polarity: polarity !== keyword.polarity ? polarity : undefined,
      notes: notes !== (keyword.notes ?? '') ? (notes.trim() || null) : undefined,
    })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        autoFocus
        className="h-8 flex-1"
      />
      <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
        <SelectTrigger className="w-28 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="positive">Positive</SelectItem>
          <SelectItem value="counter">Counter</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="h-8 w-48"
      />
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={!text.trim()}
        className="h-8 gap-1"
      >
        <Check className="h-3.5 w-3.5" />
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onCancel}
        className="h-8 gap-1"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Synonyms sub-list (loads on expand)
// ---------------------------------------------------------------------------

function SynonymsSubList({ keywordId }: { keywordId: string }) {
  const [synonyms, setSynonyms] = useState<Synonym[] | null>(null)
  const [newText, setNewText] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Synonym | null>(null)

  useEffect(() => {
    let cancelled = false
    listSynonyms(keywordId).then((rows) => {
      if (!cancelled) setSynonyms(rows)
    })
    return () => {
      cancelled = true
    }
  }, [keywordId])

  const refresh = async () => {
    setSynonyms(await listSynonyms(keywordId))
  }

  const handleAdd = async () => {
    const t = newText.trim()
    if (!t) return
    await createSynonym({ keywordId, text: t, source: 'user' })
    setNewText('')
    await refresh()
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await deleteSynonym(pendingDelete.id)
    setPendingDelete(null)
    await refresh()
  }

  return (
    <div className="bg-muted/20 px-12 py-3 border-t border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
        Synonyms
      </div>
      {synonyms === null ? (
        <div className="text-xs text-muted-foreground py-1">Loading…</div>
      ) : synonyms.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1">
          No synonyms. Add one below or use Discover → Synonyms to surface suggestions.
        </div>
      ) : (
        <ul className="space-y-1 mb-2">
          {synonyms.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.enabled}
                onCheckedChange={async () => {
                  await setSynonymEnabled(s.id, !s.enabled)
                  refresh()
                }}
                title={s.enabled ? 'Counted' : 'Skipped'}
              />
              <span className={cn('flex-1 truncate', !s.enabled && 'text-muted-foreground line-through')}>
                {s.text}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {s.source === 'ai-suggested-accepted' ? 'ai' : s.source}
              </span>
              <button
                type="button"
                onClick={() => setPendingDelete(s)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-colors p-1"
                title="Delete synonym"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Add a synonym…"
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="h-7 gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete synonym "${pendingDelete?.text ?? ''}"?`}
        description="Removes the synonym. Projects using this keyword will no longer count this term."
        confirmLabel="Delete synonym"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exclusion phrases sub-list
// ---------------------------------------------------------------------------

function ExclusionsSubList({ keywordId }: { keywordId: string }) {
  const [exclusions, setExclusions] = useState<KeywordExclusion[] | null>(null)
  const [newPhrase, setNewPhrase] = useState('')
  const [pendingDelete, setPendingDelete] = useState<KeywordExclusion | null>(null)

  useEffect(() => {
    let cancelled = false
    listExclusions(keywordId).then((rows) => {
      if (!cancelled) setExclusions(rows)
    })
    return () => { cancelled = true }
  }, [keywordId])

  const refresh = async () => { setExclusions(await listExclusions(keywordId)) }

  const handleAdd = async () => {
    const t = newPhrase.trim()
    if (!t) return
    await createExclusion({ keywordId, phrase: t })
    setNewPhrase('')
    await refresh()
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await deleteExclusion(pendingDelete.id)
    setPendingDelete(null)
    await refresh()
  }

  return (
    <div className="bg-muted/10 px-12 py-3 border-t border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        Exclusion phrases
      </div>
      <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
        If this phrase appears in the same sentence as a keyword match, the match is suppressed.
        Use to filter out wrong-context hits (e.g. add <em>gas station</em> on the keyword <em>gas</em>).
      </p>
      {exclusions === null ? (
        <div className="text-xs text-muted-foreground py-1">Loading…</div>
      ) : exclusions.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1">No exclusion phrases.</div>
      ) : (
        <ul className="space-y-1 mb-2">
          {exclusions.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 text-sm">
              <span className="flex-1 truncate font-mono text-xs">{e.phrase}</span>
              <button
                type="button"
                onClick={() => setPendingDelete(e)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-colors p-1"
                title="Remove exclusion phrase"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          value={newPhrase}
          onChange={(e) => setNewPhrase(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Add an exclusion phrase…"
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!newPhrase.trim()}
          className="h-7 gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Remove exclusion phrase "${pendingDelete?.phrase ?? ''}"?`}
        description="Matches of this keyword near that phrase will count again."
        confirmLabel="Remove"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Antonyms sub-list (positive keywords only)
// ---------------------------------------------------------------------------

function AntonymsSubList({ keywordId, listId }: { keywordId: string; listId: string }) {
  const [antonyms, setAntonyms] = useState<Keyword[] | null>(null)
  const [newText, setNewText] = useState('')
  const [pendingUnlink, setPendingUnlink] = useState<Keyword | null>(null)

  useEffect(() => {
    let cancelled = false
    listAntonymKeywords(keywordId).then((rows) => {
      if (!cancelled) setAntonyms(rows)
    })
    return () => { cancelled = true }
  }, [keywordId])

  const refresh = async () => { setAntonyms(await listAntonymKeywords(keywordId)) }

  const handleAdd = async () => {
    const t = newText.trim()
    if (!t) return
    await createAndLinkAntonym(keywordId, listId, t)
    setNewText('')
    await refresh()
  }

  const handleConfirmUnlink = async () => {
    if (!pendingUnlink) return
    await unlinkAntonym(keywordId, pendingUnlink.id)
    setPendingUnlink(null)
    await refresh()
  }

  return (
    <div className="bg-muted/5 px-12 py-3 border-t border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        Antonyms
      </div>
      <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
        Counter keywords that directly oppose this concept. Adding one here creates a counter
        keyword in the same list and records the pairing for reference.
        Unlinking removes only the pairing — the counter keyword stays in the list.
      </p>
      {antonyms === null ? (
        <div className="text-xs text-muted-foreground py-1">Loading…</div>
      ) : antonyms.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1">No antonyms linked.</div>
      ) : (
        <ul className="space-y-1 mb-2">
          {antonyms.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 text-sm">
              <span className="flex-1 truncate font-mono text-xs">{a.text}</span>
              <button
                type="button"
                onClick={() => setPendingUnlink(a)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-colors p-1"
                title="Unlink antonym"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Add an antonym…"
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="h-7 gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <ConfirmDialog
        open={pendingUnlink !== null}
        onOpenChange={(open) => { if (!open) setPendingUnlink(null) }}
        title={`Unlink antonym "${pendingUnlink?.text ?? ''}"?`}
        description="Removes the antonym pairing. The counter keyword stays in the list and continues to count against positive matches."
        confirmLabel="Unlink"
        destructive
        onConfirm={handleConfirmUnlink}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// New keyword list dialog
// ---------------------------------------------------------------------------

function NewListDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (list: KeywordList) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setName('')
    setDescription('')
    setCreating(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const created = await createKeywordList({
        name: name.trim(),
        description: description.trim() || undefined,
        type: 'custom',
      })
      onCreated(created)
      reset()
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New keyword list</DialogTitle>
            <DialogDescription>
              A custom list you can attach to any project. Add keywords inline
              afterwards, or use Discover → Phrases / Synonyms to populate from
              the corpus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label htmlFor="kwlist-name" className="text-sm font-medium">Name</label>
              <Input
                id="kwlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NIST CSF Cybersecurity Terms"
                autoFocus
                disabled={creating}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kwlist-desc" className="text-sm font-medium">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                id="kwlist-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this list for?"
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? 'Creating…' : 'Create list'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
