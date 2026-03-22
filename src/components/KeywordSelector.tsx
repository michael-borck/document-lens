import { useState, useEffect, useMemo } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getAllKeywordLists,
  parseKeywords,
  getKeywordsByCategory,
  flattenKeywords,
  type KeywordList,
  type ParsedKeywordList,
} from '@/services/keywords'
import { HierarchicalKeywordViewer } from '@/components/HierarchicalKeywordViewer'

interface KeywordSelectorProps {
  open: boolean
  onClose: () => void
  onSelect: (keywords: string[], listName: string) => void
}

export function KeywordSelector({ open, onClose, onSelect }: KeywordSelectorProps) {
  const [lists, setLists] = useState<KeywordList[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      loadLists()
    }
  }, [open])

  useEffect(() => {
    // When list changes, reset selection and expand all categories
    if (selectedListId) {
      const list = lists.find(l => l.id === selectedListId)
      if (list) {
        const parsed = parseKeywords(list)
        const categories = getKeywordsByCategory(parsed.keywords)
        setExpandedCategories(new Set(Object.keys(categories)))
        // Select all by default
        setSelectedKeywords(new Set(flattenKeywords(parsed.keywords)))
      }
    }
  }, [selectedListId, lists])

  const loadLists = async () => {
    const data = await getAllKeywordLists()
    setLists(data)
    // Select first list by default
    if (data.length > 0 && !selectedListId) {
      setSelectedListId(data[0].id)
    }
  }

  const selectedList = useMemo(() => {
    const list = lists.find(l => l.id === selectedListId)
    return list ? parseKeywords(list) : null
  }, [lists, selectedListId])

  const categories = useMemo(() => {
    if (!selectedList) return {}
    return getKeywordsByCategory(selectedList.keywords)
  }, [selectedList])

  const allKeywords = useMemo(() => {
    if (!selectedList) return []
    return flattenKeywords(selectedList.keywords)
  }, [selectedList])

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories
    
    const result: Record<string, string[]> = {}
    const query = searchQuery.toLowerCase()
    
    for (const [category, keywords] of Object.entries(categories)) {
      const filtered = keywords.filter(k => k.toLowerCase().includes(query))
      if (filtered.length > 0) {
        result[category] = filtered
      }
    }
    
    return result
  }, [categories, searchQuery])

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleKeyword = (keyword: string) => {
    const newSelection = new Set(selectedKeywords)
    if (newSelection.has(keyword)) {
      newSelection.delete(keyword)
    } else {
      newSelection.add(keyword)
    }
    setSelectedKeywords(newSelection)
  }

  const selectAllInCategory = (category: string) => {
    const newSelection = new Set(selectedKeywords)
    const categoryKeywords = categories[category] || []
    const allSelected = categoryKeywords.every(k => selectedKeywords.has(k))
    
    if (allSelected) {
      categoryKeywords.forEach(k => newSelection.delete(k))
    } else {
      categoryKeywords.forEach(k => newSelection.add(k))
    }
    
    setSelectedKeywords(newSelection)
  }

  const selectAll = () => setSelectedKeywords(new Set(allKeywords))
  const selectNone = () => setSelectedKeywords(new Set())
  const selectTopN = (n: number) => {
    const newSelection = new Set<string>()
    const categoryCount = Object.keys(categories).length
    const perCategory = Math.ceil(n / categoryCount)
    
    for (const keywords of Object.values(categories)) {
      keywords.slice(0, perCategory).forEach(k => newSelection.add(k))
      if (newSelection.size >= n) break
    }
    
    setSelectedKeywords(new Set(Array.from(newSelection).slice(0, n)))
  }

  const handleConfirm = () => {
    if (selectedList && selectedKeywords.size > 0) {
      onSelect(Array.from(selectedKeywords), selectedList.name)
      onClose()
    }
  }

  const isGrouped = Object.keys(categories).length > 1 || 
    (Object.keys(categories).length === 1 && Object.keys(categories)[0] !== 'All Keywords')

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Keywords</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* List Selector and Quick Actions */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-64">
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a keyword list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map(list => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {!selectedList?.hierarchical && (
              <div className="flex-1 relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
          </div>

          {/* Quick Select Buttons (hidden for hierarchical - it has its own controls) */}
          {!selectedList?.hierarchical && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium">Quick select:</span>
              <Button variant="outline" size="sm" onClick={selectAll}>All</Button>
              <Button variant="outline" size="sm" onClick={() => selectTopN(10)}>Top 10</Button>
              <Button variant="outline" size="sm" onClick={() => selectTopN(20)}>Top 20</Button>
              <Button variant="outline" size="sm" onClick={selectNone}>None</Button>
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {selectedKeywords.size} of {allKeywords.length} selected
              </span>
            </div>
          )}

          {/* Keywords */}
          <div className="flex-1 overflow-y-auto">
            {selectedList?.hierarchical ? (
              <HierarchicalKeywordViewer
                hierarchical={selectedList.hierarchical}
                selectionMode
                selectedKeywords={selectedKeywords}
                onSelectionChange={setSelectedKeywords}
              />
            ) : (
              <div className="border rounded-md">
                {Object.entries(filteredCategories).map(([category, keywords]) => {
                  const isExpanded = expandedCategories.has(category) || !!searchQuery
                  const categorySelected = keywords.filter(k => selectedKeywords.has(k)).length
                  const allCategorySelected = categorySelected === keywords.length

                  return (
                    <div key={category} className="border-b last:border-b-0">
                      {isGrouped && (
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${!isExpanded ? '-rotate-90' : ''}`} />
                            <span className="font-medium">{category}</span>
                            <span className="text-muted-foreground">({keywords.length})</span>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs text-muted-foreground">
                              {categorySelected}/{keywords.length}
                            </span>
                            <Checkbox
                              checked={allCategorySelected}
                              onCheckedChange={() => selectAllInCategory(category)}
                            />
                          </div>
                        </button>
                      )}

                      {isExpanded && (
                        <div className={`px-4 pb-3 ${isGrouped ? 'pt-1' : 'pt-3'}`}>
                          <div className="flex flex-wrap gap-1.5">
                            {keywords.map(keyword => {
                              const isSelected = selectedKeywords.has(keyword)
                              return (
                                <button
                                  key={keyword}
                                  onClick={() => toggleKeyword(keyword)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted hover:bg-muted/80'
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                  {keyword}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedKeywords.size === 0}>
            Use {selectedKeywords.size} Keywords
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
