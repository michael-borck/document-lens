import { useState, useEffect } from 'react'
import { Plus, Copy, Trash2, FileUp, ChevronRight, Search, ChevronDown, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  getAllKeywordLists,
  parseKeywords,
  deleteKeywordList,
  duplicateKeywordList,
  createKeywordList,
  updateKeywordList,
  parseKeywordsFromCSV,
  flattenKeywords,
  type KeywordList,
  type ParsedKeywordList,
} from '@/services/keywords'
import { KeywordListViewer } from '@/components/KeywordListViewer'
import { FOCUSES, getFocus } from '@/data/focuses'
import { cn } from '@/lib/utils'

export function KeywordLists() {
  const [lists, setLists] = useState<KeywordList[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedList, setSelectedList] = useState<ParsedKeywordList | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modal states
  const [showNewList, setShowNewList] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState<KeywordList | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showEdit, setShowEdit] = useState<KeywordList | null>(null)

  // New list form
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [newListKeywords, setNewListKeywords] = useState('')

  // Edit form
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editKeywords, setEditKeywords] = useState('')

  // Duplicate form
  const [duplicateName, setDuplicateName] = useState('')

  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    try {
      setLoading(true)
      const data = await getAllKeywordLists()
      setLists(data)
      
      // Select first list by default
      if (data.length > 0 && !selectedList) {
        setSelectedList(parseKeywords(data[0]))
      }
    } catch (error) {
      console.error('Failed to load keyword lists:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectList = (list: KeywordList) => {
    setSelectedList(parseKeywords(list))
  }

  const handleDeleteList = async (list: KeywordList) => {
    if (list.is_builtin) {
      alert('Cannot delete built-in framework lists')
      return
    }
    
    if (!confirm(`Are you sure you want to delete "${list.name}"?`)) {
      return
    }

    try {
      await deleteKeywordList(list.id)
      if (selectedList?.id === list.id) {
        setSelectedList(null)
      }
      loadLists()
    } catch (error) {
      console.error('Failed to delete list:', error)
    }
  }

  const handleDuplicate = async () => {
    if (!showDuplicate || !duplicateName.trim()) return

    try {
      await duplicateKeywordList(showDuplicate.id, duplicateName.trim())
      setShowDuplicate(null)
      setDuplicateName('')
      loadLists()
    } catch (error) {
      console.error('Failed to duplicate list:', error)
    }
  }

  const handleOpenEdit = (list: KeywordList) => {
    const parsed = parseKeywords(list)
    setEditName(list.name)
    setEditDescription(list.description || '')
    const keywords = parsed.keywords
    if (Array.isArray(keywords)) {
      setEditKeywords(keywords.join('\n'))
    } else {
      // For grouped lists, show as category: keyword lines
      const lines: string[] = []
      for (const [category, terms] of Object.entries(keywords)) {
        for (const term of terms) {
          lines.push(`${category},${term}`)
        }
      }
      setEditKeywords(lines.join('\n'))
    }
    setShowEdit(list)
  }

  const handleEditList = async () => {
    if (!showEdit || !editName.trim() || !editKeywords.trim()) return

    try {
      const lines = editKeywords
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)

      // Detect if grouped (has commas)
      const hasCategories = lines.some(l => l.includes(','))
      let keywords: Record<string, string[]> | string[]

      if (hasCategories) {
        const grouped: Record<string, string[]> = {}
        for (const line of lines) {
          const commaIdx = line.indexOf(',')
          if (commaIdx > 0) {
            const category = line.slice(0, commaIdx).trim()
            const keyword = line.slice(commaIdx + 1).trim()
            if (category && keyword) {
              if (!grouped[category]) grouped[category] = []
              grouped[category].push(keyword)
            }
          }
        }
        keywords = grouped
      } else {
        keywords = lines
      }

      await updateKeywordList(showEdit.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        keywords,
      })

      setShowEdit(null)
      loadLists()
      // Refresh the selected list if it was the one edited
      if (selectedList?.id === showEdit.id) {
        const updated = await getAllKeywordLists()
        const found = updated.find(l => l.id === showEdit.id)
        if (found) setSelectedList(parseKeywords(found))
      }
    } catch (error) {
      console.error('Failed to update list:', error)
    }
  }

  const handleCreateList = async () => {
    if (!newListName.trim() || !newListKeywords.trim()) return

    try {
      // Parse keywords (one per line)
      const keywords = newListKeywords
        .split('\n')
        .map(k => k.trim())
        .filter(k => k.length > 0)

      await createKeywordList(
        newListName.trim(),
        newListDescription.trim() || null,
        'simple',
        keywords
      )
      
      setShowNewList(false)
      setNewListName('')
      setNewListDescription('')
      setNewListKeywords('')
      loadLists()
    } catch (error) {
      console.error('Failed to create list:', error)
    }
  }

  const handleImportCSV = async () => {
    try {
      const result = await window.electron.openFileDialog({
        title: 'Select CSV file',
        filters: [{ name: 'CSV Files', extensions: ['csv', 'txt'] }],
      })

      if (result.canceled || result.filePaths.length === 0) return

      const filePath = result.filePaths[0]
      const buffer = await window.electron.readFile(filePath)
      const content = new TextDecoder().decode(buffer)
      
      // Check if CSV has categories (two columns)
      const firstLine = content.split('\n')[0]
      const hasCategories = firstLine.includes(',')
      
      const keywords = parseKeywordsFromCSV(content, hasCategories)
      const filename = filePath.split('/').pop()?.replace(/\.(csv|txt)$/i, '') || 'Imported List'
      
      await createKeywordList(
        filename,
        `Imported from ${filePath.split('/').pop()}`,
        hasCategories ? 'grouped' : 'simple',
        keywords
      )
      
      loadLists()
    } catch (error) {
      console.error('Failed to import CSV:', error)
      alert('Failed to import CSV file')
    }
  }

  const builtinLists = lists.filter(l => l.is_builtin)
  const customLists = lists.filter(l => !l.is_builtin)

  // Group built-in lists by focus
  const builtinByFocus = builtinLists.reduce((acc, list) => {
    const focus = list.focus || 'other'
    if (!acc[focus]) acc[focus] = []
    acc[focus].push(list)
    return acc
  }, {} as Record<string, KeywordList[]>)

  // Track expanded focuses
  const [expandedFocuses, setExpandedFocuses] = useState<Set<string>>(new Set(['sustainability']))

  const toggleFocus = (focusId: string) => {
    setExpandedFocuses(prev => {
      const next = new Set(prev)
      if (next.has(focusId)) {
        next.delete(focusId)
      } else {
        next.add(focusId)
      }
      return next
    })
  }

  const filteredBuiltinByFocus = Object.entries(builtinByFocus).reduce((acc, [focus, focusLists]) => {
    const filtered = searchQuery
      ? focusLists.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : focusLists
    if (filtered.length > 0) {
      acc[focus] = filtered
    }
    return acc
  }, {} as Record<string, KeywordList[]>)

  const filteredCustom = searchQuery
    ? customLists.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : customLists

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Sidebar - List Browser */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold mb-3">Keyword Lists</h1>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Built-in Frameworks by Focus */}
          {FOCUSES.filter(f => f.id !== 'general' && filteredBuiltinByFocus[f.id]?.length > 0).map(focus => {
            const focusLists = filteredBuiltinByFocus[focus.id] || []
            const isExpanded = expandedFocuses.has(focus.id)

            return (
              <div key={focus.id} className="mb-2">
                <button
                  onClick={() => toggleFocus(focus.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted rounded-md"
                >
                  <span className={cn(focus.color)}>{focus.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-normal normal-case">{focusLists.length}</span>
                    <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded ? '' : '-rotate-90')} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="space-y-1 mt-1">
                    {focusLists.map(list => {
                      const parsed = parseKeywords(list)
                      return (
                        <button
                          key={list.id}
                          onClick={() => handleSelectList(list)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${
                            selectedList?.id === list.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{list.name}</div>
                            <div className={`text-xs ${selectedList?.id === list.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {parsed.totalCount} keywords
                            </div>
                          </div>
                          <ChevronRight className={`h-4 w-4 shrink-0 ${selectedList?.id === list.id ? '' : 'opacity-0 group-hover:opacity-50'}`} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Custom Lists */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              Custom Lists
            </h2>
            {filteredCustom.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-2">
                No custom lists yet
              </p>
            ) : (
              <div className="space-y-1">
                {filteredCustom.map(list => {
                  const parsed = parseKeywords(list)
                  return (
                    <button
                      key={list.id}
                      onClick={() => handleSelectList(list)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${
                        selectedList?.id === list.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{list.name}</div>
                        <div className={`text-xs ${selectedList?.id === list.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {parsed.totalCount} keywords
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${selectedList?.id === list.id ? '' : 'opacity-0 group-hover:opacity-50'}`} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-2 border-t space-y-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setShowNewList(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New List
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleImportCSV}
          >
            <FileUp className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Main Content - List Viewer */}
      <div className="flex-1 overflow-auto">
        {selectedList ? (
          <KeywordListViewer
            list={selectedList}
            onEdit={() => {
              const original = lists.find(l => l.id === selectedList.id)
              if (original && !original.is_builtin) handleOpenEdit(original)
            }}
            onDuplicate={() => {
              const original = lists.find(l => l.id === selectedList.id)
              if (original) {
                setDuplicateName(`${original.name} (Copy)`)
                setShowDuplicate(original)
              }
            }}
            onDelete={() => {
              const original = lists.find(l => l.id === selectedList.id)
              if (original) handleDeleteList(original)
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a keyword list to view
          </div>
        )}
      </div>

      {/* New List Dialog */}
      <Dialog open={showNewList} onOpenChange={setShowNewList}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Keyword List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="My Custom Keywords"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                placeholder="Keywords for..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Keywords (one per line)</label>
              <textarea
                value={newListKeywords}
                onChange={(e) => setNewListKeywords(e.target.value)}
                placeholder="carbon&#10;emissions&#10;renewable energy&#10;sustainability"
                className="w-full h-40 px-3 py-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewList(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={!newListName.trim() || !newListKeywords.trim()}>
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!showEdit} onOpenChange={() => setShowEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Keyword List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="List name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Keywords for..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Keywords</label>
              <p className="text-xs text-muted-foreground">
                One keyword per line. For grouped lists, use format: category,keyword
              </p>
              <textarea
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
                className="w-full h-48 px-3 py-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditList} disabled={!editName.trim() || !editKeywords.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={!!showDuplicate} onOpenChange={() => setShowDuplicate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Keyword List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Create a customizable copy of "{showDuplicate?.name}"
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">New List Name</label>
              <Input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="Enter name for the copy"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicate(null)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={!duplicateName.trim()}>
              Create Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
