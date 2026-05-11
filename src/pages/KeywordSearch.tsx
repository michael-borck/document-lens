import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, Download, ChevronDown, ChevronRight, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { KeywordSelector } from '@/components/KeywordSelector'
import {
  searchKeywordsLocal,
  buildHierarchicalAggregations,
  type BatchKeywordSearchResult,
  type HierarchicalSearchResult,
} from '@/services/analysis'
import {
  type HierarchicalKeywords,
} from '@/services/keywords'
import { exportKeywordResults } from '@/services/export'
import { ProjectContextBar } from '@/components/ProjectContextBar'
import { getOrCreateProjectProfile, updateProfile, type ProfileConfig } from '@/services/profiles'
import { useProjectStore } from '@/stores/projectStore'
import { toast } from '@/stores/toastStore'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import type { DocumentRecord } from '@/services/documents'

export function KeywordSearch() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadProject = useProjectStore(s => s.loadProject)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)

  // Search state
  const [showKeywordSelector, setShowKeywordSelector] = useState(false)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [selectedListName, setSelectedListName] = useState('')
  const [quickSearch, setQuickSearch] = useState('')
  const [results, setResults] = useState<BatchKeywordSearchResult | null>(null)
  const [hierarchicalResults, setHierarchicalResults] = useState<HierarchicalSearchResult | null>(null)
  const [activeHierarchy, setActiveHierarchy] = useState<HierarchicalKeywords | null>(null)

  // View state
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'matches' | 'name' | 'year'>('matches')
  const [filterKeyword, setFilterKeyword] = useState('')
  const [viewBy, setViewBy] = useState<string>('keywords') // 'keywords' or a tier name

  // Profile reference for saving search state
  const [profileId, setProfileId] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
      loadDocuments()
      loadSavedSearch()
    }
  }, [projectId])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const result = await window.electron.dbQuery<DocumentRecord>(
        `SELECT d.* FROM documents d
         INNER JOIN project_documents pd ON pd.document_id = d.id
         WHERE pd.project_id = ? AND d.extracted_text IS NOT NULL`,
        [projectId]
      )
      setDocuments(result)
    } catch (error) {
      console.error('Failed to load documents:', error)
      toast.error('Couldn’t load documents for keyword search', error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const loadSavedSearch = async () => {
    if (!projectId) return
    try {
      const profile = await getOrCreateProjectProfile(projectId)
      setProfileId(profile.id)
      if (profile.config.lastSearch) {
        const { listName, selectedKeywords: saved, quickSearch: savedQuick, viewByTier } = profile.config.lastSearch
        if (saved.length > 0) {
          setSelectedKeywords(saved)
          setSelectedListName(listName)
        }
        if (savedQuick) {
          setQuickSearch(savedQuick)
        }
        if (viewByTier) {
          setViewBy(viewByTier)
        }
      }
    } catch (error) {
      console.error('Failed to load saved search state:', error)
    }
  }

  const saveSearchState = async (keywords: string[], listName: string, quick: string = quickSearch, tierView: string = viewBy) => {
    if (!projectId || !profileId) return
    try {
      // Look up list ID by name for robust reference
      let listId = ''
      try {
        const lists = await window.electron.dbQuery<{ id: string }>(
          'SELECT id FROM keyword_lists WHERE name = ? LIMIT 1',
          [listName]
        )
        if (lists[0]) listId = lists[0].id
      } catch { /* ignore */ }

      const profile = await getOrCreateProjectProfile(projectId)
      const updatedConfig: ProfileConfig = {
        ...profile.config,
        lastSearch: {
          listId,
          listName,
          selectedKeywords: keywords,
          quickSearch: quick,
          viewByTier: tierView,
        }
      }
      await updateProfile(profileId, { config: updatedConfig })
    } catch (error) {
      console.error('Failed to save search state:', error)
    }
  }

  // Save viewBy when it changes
  const handleViewByChange = (newViewBy: string) => {
    setViewBy(newViewBy)
    if (selectedKeywords.length > 0) {
      saveSearchState(selectedKeywords, selectedListName, quickSearch, newViewBy)
    }
  }

  const handleKeywordSelect = async (keywords: string[], listName: string) => {
    setSelectedKeywords(keywords)
    setSelectedListName(listName)
    saveSearchState(keywords, listName)

    // Check if the selected list is hierarchical
    try {
      const allLists = await window.electron.dbQuery<{ id: string; name: string; list_type: string; keywords: string }>(
        'SELECT id, name, list_type, keywords FROM keyword_lists WHERE name = ?',
        [listName]
      )
      const list = allLists[0]
      if (list && list.list_type === 'hierarchical') {
        const raw = JSON.parse(list.keywords)
        if (raw.tiers && raw.tree) {
          setActiveHierarchy({ tiers: raw.tiers, tree: raw.tree })
          setViewBy(raw.tiers[0] || 'keywords') // Default to top tier view
          return
        }
      }
    } catch (error) {
      console.error('Failed to check for hierarchical list:', error)
    }
    setActiveHierarchy(null)
    setViewBy('keywords')
  }

  const runSearch = async () => {
    if (documents.length === 0) return
    
    // Combine selected keywords with quick search terms
    const keywords = [...selectedKeywords]
    if (quickSearch.trim()) {
      const quickTerms = quickSearch.split(',').map(t => t.trim()).filter(t => t)
      keywords.push(...quickTerms)
    }

    if (keywords.length === 0) {
      alert('Please select keywords or enter search terms')
      return
    }

    setSearching(true)
    setSearchProgress(0)

    try {
      // Simulate progress for UX
      const progressInterval = setInterval(() => {
        setSearchProgress(p => Math.min(p + 10, 90))
      }, 100)

      const searchResults = await searchKeywordsLocal(documents, keywords, 150)

      clearInterval(progressInterval)
      setSearchProgress(100)
      setResults(searchResults)

      // Build hierarchical aggregations if applicable
      if (activeHierarchy) {
        const hierResults = buildHierarchicalAggregations(searchResults, activeHierarchy)
        setHierarchicalResults(hierResults)
      } else {
        setHierarchicalResults(null)
      }
      
      // Expand first few docs by default
      const topDocs = searchResults.documents.slice(0, 3).map(d => d.documentId)
      setExpandedDocs(new Set(topDocs))
    } catch (error) {
      console.error('Search failed:', error)
      alert('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const toggleDocExpand = (docId: string) => {
    const newExpanded = new Set(expandedDocs)
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId)
    } else {
      newExpanded.add(docId)
    }
    setExpandedDocs(newExpanded)
  }

  const sortedResults = useMemo(() => {
    if (!results) return []
    
    const sorted = [...results.documents]
    
    switch (sortBy) {
      case 'matches':
        sorted.sort((a, b) => b.totalMatches - a.totalMatches)
        break
      case 'name':
        sorted.sort((a, b) => a.documentName.localeCompare(b.documentName))
        break
      case 'year':
        sorted.sort((a, b) => (b.reportYear || 0) - (a.reportYear || 0))
        break
    }
    
    return sorted
  }, [results, sortBy])

  const debouncedFilterKeyword = useDebouncedValue(filterKeyword, 200)

  const highlightText = (text: string, keywords: string[]) => {
    if (!keywords.length) return text
    
    const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, i) => {
      const isMatch = keywords.some(k => part.toLowerCase() === k.toLowerCase())
      return isMatch ? (
        <mark key={i} className="bg-brass/25 text-foreground px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    })
  }

  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx')

  const exportResults = () => {
    if (!results) return
    const filename = `keyword-search-results-${new Date().toISOString().split('T')[0]}`
    exportKeywordResults(results, filename, exportFormat)
  }

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
    <div>
      <ProjectContextBar />
      <div className="p-8">

      {/* Search Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Framework Keywords */}
            <div className="flex items-center gap-4">
              <Button onClick={() => setShowKeywordSelector(true)}>
                Select Framework Keywords
              </Button>
              {selectedKeywords.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>
                    {selectedKeywords.length} keywords from {selectedListName}
                  </span>
                  <button
                    onClick={() => handleKeywordSelect([], '')}
                    className="ml-1 -my-1 p-1 hover:text-foreground rounded transition-colors"
                    title="Clear keyword selection"
                    aria-label="Clear keyword selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Search */}
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-md">
                <Input
                  placeholder="Quick search: enter terms separated by commas..."
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                />
              </div>
              <Button onClick={runSearch} disabled={searching || documents.length === 0}>
                <Search className="h-4 w-4 mr-2" />
                {searching ? 'Searching...' : 'Search'}
              </Button>
            </div>

            {/* Progress */}
            {searching && (
              <Progress value={searchProgress} className="h-2" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Results Summary</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="xlsx">Excel</option>
                    <option value="csv">CSV</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={exportResults}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-2xl font-bold">{results.summary.totalMatches}</div>
                  <div className="text-sm text-muted-foreground">Total Matches</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{results.keywords.length}</div>
                  <div className="text-sm text-muted-foreground">Keywords Searched</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {results.documents.filter(d => d.totalMatches > 0).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Documents with Matches</div>
                </div>
              </div>

              {/* Top Keywords */}
              <div>
                <h4 className="text-sm font-medium mb-2">Top Keywords by Frequency</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(results.summary.keywordCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([keyword, count]) => (
                      <span
                        key={keyword}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-full text-sm"
                      >
                        {keyword}
                        <span className="text-xs bg-primary/20 px-1.5 rounded-full">{count}</span>
                      </span>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tier-level view toggle (hierarchical only) */}
          {hierarchicalResults && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-sm font-medium">View by:</span>
                  <div className="flex gap-1">
                    {hierarchicalResults.hierarchy.tiers.map(tier => (
                      <Button
                        key={tier}
                        variant={viewBy === tier ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleViewByChange(tier)}
                      >
                        {tier}
                      </Button>
                    ))}
                    <Button
                      variant={viewBy === 'keywords' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleViewByChange('keywords')}
                    >
                      Keywords
                    </Button>
                  </div>
                </div>

                {viewBy !== 'keywords' && hierarchicalResults.overallTiers[viewBy] && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(hierarchicalResults.overallTiers[viewBy]).map(([category, agg]) => (
                      <div key={category} className="border rounded-lg p-3">
                        <div className="font-medium text-sm mb-1">{category}</div>
                        <div className="text-2xl font-bold">{agg.matchCount}</div>
                        <div className="text-xs text-muted-foreground">
                          matches
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Coverage</span>
                            <span>{Math.round(agg.coverage * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.round(agg.coverage * 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {agg.keywordCount} of {agg.totalKeywords} keywords found
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Controls */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="matches">Most Matches</option>
                <option value="name">Document Name</option>
                <option value="year">Report Year</option>
              </select>
            </div>
            <div className="flex-1" />
            <Input
              placeholder="Filter keywords..."
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              className="w-48"
            />
          </div>

          {/* Document Results */}
          <div className="space-y-2">
            {sortedResults.map((doc) => {
              const isExpanded = expandedDocs.has(doc.documentId)
              const hasMatches = doc.totalMatches > 0
              
              return (
                <Card key={doc.documentId} className={!hasMatches ? 'opacity-50' : ''}>
                  <button
                    onClick={() => toggleDocExpand(doc.documentId)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                    disabled={!hasMatches}
                  >
                    {hasMatches ? (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )
                    ) : (
                      <div className="w-4" />
                    )}
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{doc.documentName}</div>
                      <div className="text-sm text-muted-foreground">
                        {doc.companyName || 'Unknown Company'}
                        {doc.reportYear && ` - ${doc.reportYear}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{doc.totalMatches}</div>
                      <div className="text-xs text-muted-foreground">matches</div>
                    </div>
                  </button>

                  {isExpanded && hasMatches && (
                    <CardContent className="pt-0 border-t">
                      {/* Tier-level view for this document */}
                      {viewBy !== 'keywords' && hierarchicalResults && (() => {
                        const docTier = hierarchicalResults.documentTiers.find(d => d.documentId === doc.documentId)
                        const tierAgg = docTier?.tiers[viewBy]
                        if (!tierAgg) return null
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                            {Object.entries(tierAgg).map(([category, agg]) => (
                              <div key={category} className="border rounded p-2 text-center">
                                <div className="text-xs font-medium truncate">{category}</div>
                                <div className="text-lg font-bold">{agg.matchCount}</div>
                                <div className="text-xs text-muted-foreground">
                                  {Math.round(agg.coverage * 100)}% coverage
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Keyword-level detail */}
                      {viewBy === 'keywords' && (
                      <div className="space-y-4 mt-4">
                        {Object.entries(doc.matches)
                          .filter(([keyword]) =>
                            !debouncedFilterKeyword || keyword.toLowerCase().includes(debouncedFilterKeyword.toLowerCase())
                          )
                          .sort((a, b) => b[1].count - a[1].count)
                          .map(([keyword, match]) => (
                            <div key={keyword}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium text-sm">{keyword}</span>
                                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                                  {match.count} occurrences
                                </span>
                              </div>
                              <div className="space-y-2 pl-4">
                                {match.contexts.slice(0, 5).map((ctx, i) => (
                                  <div
                                    key={i}
                                    className="text-sm text-muted-foreground bg-muted/30 p-2 rounded"
                                  >
                                    {highlightText(ctx.text, [keyword])}
                                  </div>
                                ))}
                                {match.contexts.length > 5 && (
                                  <div className="text-xs text-muted-foreground">
                                    +{match.contexts.length - 5} more occurrences
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* No Results */}
      {!results && !searching && documents.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Ready to Search</h2>
            <p className="text-muted-foreground mb-4">
              Select framework keywords or enter search terms to find mentions across your documents
            </p>
          </CardContent>
        </Card>
      )}

      {/* No Documents */}
      {documents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">No Documents Available</h2>
            <p className="text-muted-foreground mb-4">
              Import PDF documents to your project first, then return here to search
            </p>
            <Link to={`/project/${projectId}`}>
              <Button>Go to Project</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Keyword Selector Modal */}
      <KeywordSelector
        open={showKeywordSelector}
        onClose={() => setShowKeywordSelector(false)}
        onSelect={handleKeywordSelect}
      />
      </div>
    </div>
  )
}
