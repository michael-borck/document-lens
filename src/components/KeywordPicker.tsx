/**
 * KeywordPicker Component
 *
 * Simplified keyword list selector for configuring which keyword lists
 * and keywords are active for a project. Saves directly to the profile
 * via the Zustand store.
 *
 * Simpler than ProfileEditor — just checkboxes for lists + expandable
 * keyword selection. No domains, analysis types, or other settings.
 */

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
  flattenKeywords,
  type KeywordList,
} from '@/services/keywords'
import { useProjectStore } from '@/stores/projectStore'

interface KeywordPickerProps {
  open: boolean
  onClose: () => void
}

export function KeywordPicker({ open, onClose }: KeywordPickerProps) {
  const { profile, updateProfileConfig } = useProjectStore()
  const [lists, setLists] = useState<KeywordList[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Local copy of keyword config for editing
  const [keywordConfig, setKeywordConfig] = useState<Record<string, { enabled: boolean; selected: string[] }>>({})

  useEffect(() => {
    if (open) {
      loadLists()
      if (profile?.config.keywords) {
        setKeywordConfig({ ...profile.config.keywords })
      }
    }
  }, [open, profile])

  const loadLists = async () => {
    setLoading(true)
    try {
      const data = await getAllKeywordLists()
      setLists(data)
    } catch (error) {
      console.error('Failed to load keyword lists:', error)
    } finally {
      setLoading(false)
    }
  }

  const getConfigKey = (list: KeywordList): string => {
    return list.framework && list.framework !== 'custom' ? list.framework : list.id
  }

  const getListKeywords = (list: KeywordList): string[] => {
    try {
      const parsed = parseKeywords(list)
      return flattenKeywords(parsed.keywords)
    } catch {
      return []
    }
  }

  const toggleList = (list: KeywordList) => {
    const key = getConfigKey(list)
    const current = keywordConfig[key]
    const allKeywords = getListKeywords(list)

    if (current?.enabled) {
      // Disable
      setKeywordConfig(prev => ({
        ...prev,
        [key]: { enabled: false, selected: [] }
      }))
    } else {
      // Enable with all keywords selected
      setKeywordConfig(prev => ({
        ...prev,
        [key]: { enabled: true, selected: allKeywords }
      }))
    }
  }

  const toggleKeyword = (listKey: string, keyword: string) => {
    setKeywordConfig(prev => {
      const current = prev[listKey] || { enabled: true, selected: [] }
      const selected = current.selected.includes(keyword)
        ? current.selected.filter(k => k !== keyword)
        : [...current.selected, keyword]
      return {
        ...prev,
        [listKey]: { enabled: selected.length > 0, selected }
      }
    })
  }

  const toggleExpand = (key: string) => {
    setExpandedLists(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSave = async () => {
    if (!profile) return
    const updatedConfig = { ...profile.config, keywords: keywordConfig }
    await updateProfileConfig(updatedConfig)
    onClose()
  }

  const totalSelected = useMemo(() => {
    let count = 0
    for (const val of Object.values(keywordConfig)) {
      if (val.enabled) count += val.selected.length
    }
    return count
  }, [keywordConfig])

  const builtinLists = lists.filter(l => l.is_builtin)
  const customLists = lists.filter(l => !l.is_builtin)

  const filterList = (items: KeywordList[]) => {
    if (!searchQuery) return items
    const q = searchQuery.toLowerCase()
    return items.filter(l => l.name.toLowerCase().includes(q))
  }

  const renderList = (list: KeywordList) => {
    const key = getConfigKey(list)
    const allKeywords = getListKeywords(list)
    const config = keywordConfig[key]
    const enabled = config?.enabled ?? false
    const selectedCount = config?.selected?.length ?? 0
    const expanded = expandedLists.has(key)

    return (
      <div key={list.id} className="border rounded-lg">
        <div className="flex items-center gap-3 p-3 hover:bg-muted/50">
          <Checkbox
            checked={enabled}
            onCheckedChange={() => toggleList(list)}
          />
          <button
            className="flex items-center gap-2 flex-1 text-left"
            onClick={() => toggleExpand(key)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{list.name}</div>
              <div className="text-xs text-muted-foreground">
                {enabled ? `${selectedCount}/${allKeywords.length} selected` : `${allKeywords.length} keywords`}
              </div>
            </div>
          </button>
          {list.list_type === 'hierarchical' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">taxonomy</span>
          )}
        </div>

        {expanded && enabled && (
          <div className="p-3 pt-0 max-h-48 overflow-y-auto border-t">
            <div className="flex items-center gap-2 mb-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setKeywordConfig(prev => ({
                  ...prev,
                  [key]: { enabled: true, selected: allKeywords }
                }))}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setKeywordConfig(prev => ({
                  ...prev,
                  [key]: { enabled: true, selected: [] }
                }))}
              >
                None
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allKeywords.map(keyword => {
                const isSelected = config?.selected?.includes(keyword) ?? false
                return (
                  <button
                    key={keyword}
                    onClick={() => toggleKeyword(key, keyword)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
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
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Keywords</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Input
            placeholder="Search keyword lists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {totalSelected} keywords selected
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <>
              {filterList(builtinLists).map(renderList)}

              {customLists.length > 0 && (
                <>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                    Custom Lists
                  </div>
                  {filterList(customLists).map(renderList)}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            Save ({totalSelected} keywords)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
