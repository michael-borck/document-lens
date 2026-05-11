import { useState, useMemo } from 'react'
import { Copy, Trash2, ChevronDown, ChevronRight, Check, Search, Pencil, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import {
  getKeywordsByCategory,
  flattenKeywords,
  updateKeywordList,
  type ParsedKeywordList,
} from '@/services/keywords'
import { HierarchicalKeywordViewer } from '@/components/HierarchicalKeywordViewer'

interface KeywordListViewerProps {
  list: ParsedKeywordList
  onDuplicate: () => void
  onDelete: () => void
  onEdit?: () => void
  onConvertToTaxonomy?: () => void
  selectionMode?: boolean
  selectedKeywords?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
}

export function KeywordListViewer({
  list,
  onDuplicate,
  onDelete,
  onEdit,
  onConvertToTaxonomy,
  selectionMode = false,
  selectedKeywords: externalSelection,
  onSelectionChange,
}: KeywordListViewerProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [internalSelection, setInternalSelection] = useState<Set<string>>(new Set())
  
  const selectedKeywords = externalSelection ?? internalSelection
  const setSelectedKeywords = onSelectionChange ?? setInternalSelection

  const categories = useMemo(() => getKeywordsByCategory(list.keywords), [list.keywords])
  const allKeywords = useMemo(() => flattenKeywords(list.keywords), [list.keywords])

  // Filter keywords by search
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

  const selectAll = () => {
    if (selectedKeywords.size === allKeywords.length) {
      setSelectedKeywords(new Set())
    } else {
      setSelectedKeywords(new Set(allKeywords))
    }
  }

  const selectTopN = (n: number) => {
    // Select first N keywords from each category proportionally
    const newSelection = new Set<string>()
    const categoryCount = Object.keys(categories).length
    const perCategory = Math.ceil(n / categoryCount)
    
    for (const keywords of Object.values(categories)) {
      keywords.slice(0, perCategory).forEach(k => newSelection.add(k))
      if (newSelection.size >= n) break
    }
    
    // Trim to exactly N
    const arr = Array.from(newSelection).slice(0, n)
    setSelectedKeywords(new Set(arr))
  }

  const selectNone = () => {
    setSelectedKeywords(new Set())
  }

  const expandAll = () => {
    setExpandedCategories(new Set(Object.keys(categories)))
  }

  const collapseAll = () => {
    setExpandedCategories(new Set())
  }

  const categoryNames = Object.keys(filteredCategories)
  const isGrouped = categoryNames.length > 1 || (categoryNames.length === 1 && categoryNames[0] !== 'All Keywords')

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{list.name}</h2>
          {list.description && (
            <p className="text-muted-foreground mt-1 max-w-2xl">{list.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>{list.totalCount} keywords</span>
            {isGrouped && <span>{Object.keys(categories).length} categories</span>}
            {list.framework && list.framework !== 'custom' && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs uppercase">
                {list.framework}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!list.is_builtin && onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {onConvertToTaxonomy && !list.hierarchical && isGrouped && (
            <Button variant="outline" size="sm" onClick={onConvertToTaxonomy}>
              <Layers className="h-4 w-4 mr-2" />
              Convert to Taxonomy
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </Button>
          {!list.is_builtin && (
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Hierarchical view */}
      {list.hierarchical ? (
        <HierarchicalKeywordViewer
          hierarchical={list.hierarchical}
          selectionMode={selectionMode}
          selectedKeywords={selectedKeywords}
          onSelectionChange={setSelectedKeywords}
          editable={!list.is_builtin}
          onTierRename={!list.is_builtin ? async (tierIndex, newName) => {
            if (!list.hierarchical) return
            const updatedTiers = [...list.hierarchical.tiers]
            updatedTiers[tierIndex] = newName
            const updatedKeywords = {
              tiers: updatedTiers,
              tree: list.hierarchical.tree,
            }
            try {
              await updateKeywordList(list.id, {
                keywords: updatedKeywords as unknown as Record<string, string[]>,
              })
            } catch (error) {
              console.error('Failed to rename tier:', error)
            }
          } : undefined}
        />
      ) : (
      <>
      {/* Search and Quick Actions */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        
        {selectionMode && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedKeywords.size} of {allKeywords.length} selected
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={selectAll}>
                {selectedKeywords.size === allKeywords.length ? 'Deselect All' : 'Select All'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => selectTopN(10)}>
                Top 10
              </Button>
              <Button variant="outline" size="sm" onClick={() => selectTopN(20)}>
                Top 20
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                None
              </Button>
            </div>
          </div>
        )}
        
        {isGrouped && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        )}
      </div>

      {/* Keywords */}
      <Card>
        <CardContent className="p-0">
          {Object.entries(filteredCategories).map(([category, keywords]) => {
            const isExpanded = expandedCategories.has(category) || !isGrouped || !!searchQuery
            const categorySelected = keywords.filter(k => selectedKeywords.has(k)).length
            const allCategorySelected = categorySelected === keywords.length
            
            return (
              <div key={category} className="border-b last:border-b-0">
                {/* Category Header */}
                {isGrouped && (
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{category}</span>
                      <span className="text-sm text-muted-foreground">
                        ({keywords.length} keywords)
                      </span>
                    </div>
                    {selectionMode && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-muted-foreground">
                          {categorySelected}/{keywords.length}
                        </span>
                        <Checkbox
                          checked={allCategorySelected}
                          onCheckedChange={() => selectAllInCategory(category)}
                        />
                      </div>
                    )}
                  </button>
                )}
                
                {/* Keywords Grid */}
                {isExpanded && (
                  <div className={`px-4 pb-4 ${isGrouped ? 'pt-0' : 'pt-4'}`}>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map(keyword => {
                        const isSelected = selectedKeywords.has(keyword)
                        
                        if (selectionMode) {
                          return (
                            <button
                              key={keyword}
                              onClick={() => toggleKeyword(keyword)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                              {keyword}
                            </button>
                          )
                        }
                        
                        return (
                          <span
                            key={keyword}
                            className="inline-block px-3 py-1.5 bg-muted rounded-full text-sm"
                          >
                            {keyword}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          
          {Object.keys(filteredCategories).length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No keywords match your search
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
