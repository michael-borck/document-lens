/**
 * HierarchicalKeywordViewer Component
 *
 * Renders a multi-level keyword taxonomy as a collapsible tree.
 * Supports arbitrary depth via recursive rendering.
 * Shows aggregate keyword counts at each tier level.
 */

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import {
  flattenHierarchy,
  type HierarchicalKeywords,
  type HierarchyNode,
} from '@/services/keywords'

interface HierarchicalKeywordViewerProps {
  hierarchical: HierarchicalKeywords
  selectionMode?: boolean
  selectedKeywords?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
  /** Allow editing tier names */
  editable?: boolean
  /** Called when a tier name is changed */
  onTierRename?: (tierIndex: number, newName: string) => void
}

export function HierarchicalKeywordViewer({
  hierarchical,
  selectionMode = false,
  selectedKeywords: externalSelection,
  onSelectionChange,
  editable = false,
  onTierRename,
}: HierarchicalKeywordViewerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [internalSelection, setInternalSelection] = useState<Set<string>>(new Set())

  const selectedKeywords = externalSelection ?? internalSelection
  const setSelectedKeywords = onSelectionChange ?? setInternalSelection

  const allKeywords = useMemo(() => flattenHierarchy(hierarchical.tree), [hierarchical])

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const expandAll = () => {
    const paths = new Set<string>()
    const walk = (node: HierarchyNode, prefix: string) => {
      for (const [key, value] of Object.entries(node)) {
        const path = prefix ? `${prefix}/${key}` : key
        paths.add(path)
        if (!Array.isArray(value)) {
          walk(value, path)
        }
      }
    }
    walk(hierarchical.tree, '')
    setExpandedNodes(paths)
  }

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  const selectAllUnder = (node: HierarchyNode | string[]) => {
    const keywords = Array.isArray(node) ? node : flattenHierarchy(node)
    const newSelection = new Set(selectedKeywords)
    const allSelected = keywords.every(k => selectedKeywords.has(k))
    if (allSelected) {
      keywords.forEach(k => newSelection.delete(k))
    } else {
      keywords.forEach(k => newSelection.add(k))
    }
    setSelectedKeywords(newSelection)
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

  // Filter tree by search query
  const filterTree = (node: HierarchyNode, query: string): HierarchyNode | null => {
    if (!query) return node
    const lowerQuery = query.toLowerCase()
    const result: HierarchyNode = {}
    let hasMatch = false

    for (const [key, value] of Object.entries(node)) {
      if (key.toLowerCase().includes(lowerQuery)) {
        result[key] = value
        hasMatch = true
      } else if (Array.isArray(value)) {
        const filtered = value.filter(k => k.toLowerCase().includes(lowerQuery))
        if (filtered.length > 0) {
          result[key] = filtered
          hasMatch = true
        }
      } else {
        const filteredChild = filterTree(value, query)
        if (filteredChild && Object.keys(filteredChild).length > 0) {
          result[key] = filteredChild
          hasMatch = true
        }
      }
    }

    return hasMatch ? result : null
  }

  const filteredTree = useMemo(
    () => filterTree(hierarchical.tree, searchQuery) ?? {},
    [hierarchical.tree, searchQuery]
  )

  const getNodeCount = (node: HierarchyNode | string[]): number => {
    return Array.isArray(node) ? node.length : flattenHierarchy(node).length
  }

  const getChildCount = (node: HierarchyNode): number => {
    return Object.keys(node).length
  }

  const getSelectedCount = (node: HierarchyNode | string[]): number => {
    const keywords = Array.isArray(node) ? node : flattenHierarchy(node)
    return keywords.filter(k => selectedKeywords.has(k)).length
  }

  // Recursive tree renderer
  const renderNode = (
    node: HierarchyNode,
    depth: number,
    parentPath: string
  ) => {
    const tierName = hierarchical.tiers[depth] || `Level ${depth + 1}`

    return Object.entries(node).map(([key, value]) => {
      const path = parentPath ? `${parentPath}/${key}` : key
      const isLeaf = Array.isArray(value)
      const isExpanded = expandedNodes.has(path) || !!searchQuery
      const keywordCount = getNodeCount(value)
      const selectedCount = getSelectedCount(value)

      // Indent based on depth
      const paddingLeft = depth * 16

      return (
        <div key={path} className="border-b last:border-b-0">
          {/* Category header */}
          <button
            onClick={() => toggleNode(path)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            style={{ paddingLeft: `${16 + paddingLeft}px` }}
          >
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="text-left">
                <span className="font-medium">{key}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {isLeaf ? (
                    `${keywordCount} keywords`
                  ) : (
                    `${getChildCount(value as HierarchyNode)} ${tierName === hierarchical.tiers[depth] ? (hierarchical.tiers[depth + 1] || 'groups').toLowerCase() + 's' : 'groups'}, ${keywordCount} keywords`
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectionMode && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground">
                    {selectedCount}/{keywordCount}
                  </span>
                  <Checkbox
                    checked={selectedCount === keywordCount && keywordCount > 0}
                    onCheckedChange={() => selectAllUnder(value)}
                  />
                </div>
              )}
              {depth === 0 && (
                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  {tierName}
                </span>
              )}
            </div>
          </button>

          {/* Children */}
          {isExpanded && (
            isLeaf ? (
              // Leaf: show keyword pills
              <div className="px-4 pb-4" style={{ paddingLeft: `${32 + paddingLeft}px` }}>
                <div className="flex flex-wrap gap-2">
                  {(value as string[]).map(keyword => {
                    const isSelected = selectedKeywords.has(keyword)
                    if (selectionMode) {
                      return (
                        <button
                          key={keyword}
                          onClick={() => toggleKeyword(keyword)}
                          className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm transition-colors ${
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80'
                          }`}
                        >
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
            ) : (
              // Branch: recurse
              renderNode(value as HierarchyNode, depth + 1, path)
            )
          )}
        </div>
      )
    })
  }

  return (
    <div>
      {/* Tier legend */}
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <span>Taxonomy tiers:</span>
        {hierarchical.tiers.map((tier, i) => (
          <span key={i} className="flex items-center">
            {editable && onTierRename ? (
              <Input
                value={tier}
                onChange={(e) => onTierRename(i, e.target.value)}
                className="h-6 w-24 text-xs px-2 bg-primary/10 text-primary border-primary/20"
              />
            ) : (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
                {tier}
              </span>
            )}
            {i < hierarchical.tiers.length - 1 && <span className="mx-1">&rarr;</span>}
          </span>
        ))}
        <span className="mx-1">&rarr;</span>
        <span className="text-xs">Keywords</span>
      </div>

      {/* Search and controls */}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedKeywords.size === allKeywords.length) {
                  setSelectedKeywords(new Set())
                } else {
                  setSelectedKeywords(new Set(allKeywords))
                }
              }}
            >
              {selectedKeywords.size === allKeywords.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedKeywords(new Set())}>
              None
            </Button>
          </div>
        )}

        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* Tree */}
      <Card>
        <CardContent className="p-0">
          {Object.keys(filteredTree).length > 0 ? (
            renderNode(filteredTree, 0, '')
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              {searchQuery ? 'No keywords match your search' : 'No keywords in this taxonomy'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
