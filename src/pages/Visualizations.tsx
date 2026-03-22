import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Cloud,
  TrendingUp,
  Grid3X3,
  Radar,
  Loader2,
  Settings2,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpButton } from '@/components/HelpButton'
import {
  WordCloud,
  KeywordBarChart,
  KeywordHeatmap,
  TrendLineChart,
  FrameworkRadarChart,
  GroupedBarChart,
  ChartExportButton,
  TaxonomyTreemap,
  TaxonomyStackedBar,
  type WordCloudWord,
  type KeywordBarData,
  type HeatmapCell,
  type TrendDataPoint,
  type RadarDataPoint,
  type GroupedBarDataPoint,
} from '@/components/charts'
import { KeywordSelector } from '@/components/KeywordSelector'
import { DocumentFilter } from '@/components/DocumentFilter'
import {
  searchKeywordsLocal,
  buildHierarchicalAggregations,
  type BatchKeywordSearchResult,
  type HierarchicalSearchResult,
} from '@/services/analysis'
import type { DocumentRecord } from '@/services/documents'
import {
  getActiveProfile,
  getEnabledKeywords,
  type ParsedAnalysisProfile,
} from '@/services/profiles'
import { type HierarchicalKeywords } from '@/services/keywords'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectContextBar } from '@/components/ProjectContextBar'

export function Visualizations() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadProject = useProjectStore(s => s.loadProject)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // Document filter - null means all documents
  const [filteredDocIds, setFilteredDocIds] = useState<string[] | null>(null)

  // Keyword selection
  const [showKeywordSelector, setShowKeywordSelector] = useState(false)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [selectedListName, setSelectedListName] = useState('')
  const [searchResults, setSearchResults] = useState<BatchKeywordSearchResult | null>(null)
  const [hierarchicalResults, setHierarchicalResults] = useState<HierarchicalSearchResult | null>(null)

  // Profile
  const [profile, setProfile] = useState<ParsedAnalysisProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  // Chart refs for export
  const wordCloudRef = useRef<HTMLDivElement>(null)
  const barChartRef = useRef<HTMLDivElement>(null)
  const heatmapRef = useRef<HTMLDivElement>(null)
  const trendChartRef = useRef<HTMLDivElement>(null)
  const radarChartRef = useRef<HTMLDivElement>(null)
  const groupedBarRef = useRef<HTMLDivElement>(null)
  const taxonomyTreemapRef = useRef<HTMLDivElement>(null)
  const taxonomyBarRef = useRef<HTMLDivElement>(null)

  // LocalStorage key for persisting keyword selection
  const storageKey = `visualization-keywords-${projectId}`

  // Get filtered documents based on selection
  const activeDocuments = useMemo(() => {
    if (filteredDocIds === null) return documents
    return documents.filter((d) => filteredDocIds.includes(d.id))
  }, [documents, filteredDocIds])

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
      loadDocuments()
      loadProfile()
    }
  }, [projectId])

  const loadProfile = async () => {
    try {
      setLoadingProfile(true)
      const activeProfile = await getActiveProfile(projectId!)
      setProfile(activeProfile)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoadingProfile(false)
    }
  }

  const handleUseProfile = async () => {
    if (!profile) return

    const keywords = getEnabledKeywords(profile.config)
    if (keywords.length === 0) {
      alert('No keywords are configured in your profile. Open Profile Settings to add keywords.')
      return
    }

    handleKeywordSelect(keywords, `${profile.name} Keywords`)
  }

  // Load saved keywords after documents are loaded
  useEffect(() => {
    if (!loading && documents.length > 0 && !searchResults) {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const { keywords, listName } = JSON.parse(saved)
          if (keywords?.length > 0) {
            // Auto-run analysis with saved keywords
            handleKeywordSelect(keywords, listName || 'Saved Selection')
          }
        } catch (e) {
          console.warn('Failed to load saved keywords:', e)
          localStorage.removeItem(storageKey)
        }
      }
    }
  }, [loading, documents.length])

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
    } finally {
      setLoading(false)
    }
  }

  const handleKeywordSelect = async (keywords: string[], listName: string) => {
    setSelectedKeywords(keywords)
    setSelectedListName(listName)
    setShowKeywordSelector(false)

    // Save to localStorage for persistence
    if (keywords.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify({ keywords, listName }))
    } else {
      localStorage.removeItem(storageKey)
    }

    if (keywords.length === 0 || activeDocuments.length === 0) {
      setSearchResults(null)
      return
    }

    setAnalyzing(true)
    try {
      const results = await searchKeywordsLocal(activeDocuments, keywords, 100)
      setSearchResults(results)

      // Check if the selected list is hierarchical
      try {
        const allLists = await window.electron.dbQuery<{ list_type: string; keywords: string }>(
          'SELECT list_type, keywords FROM keyword_lists WHERE name = ?',
          [listName]
        )
        const list = allLists[0]
        if (list?.list_type === 'hierarchical') {
          const raw = JSON.parse(list.keywords)
          if (raw.tiers && raw.tree) {
            const hier = buildHierarchicalAggregations(results, { tiers: raw.tiers, tree: raw.tree })
            setHierarchicalResults(hier)
          } else {
            setHierarchicalResults(null)
          }
        } else {
          setHierarchicalResults(null)
        }
      } catch {
        setHierarchicalResults(null)
      }
    } catch (error) {
      console.error('Analysis failed:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  // Re-run analysis when filter changes (if keywords are already selected)
  const handleFilterChange = (newIds: string[] | null) => {
    setFilteredDocIds(newIds)
    // Re-run analysis with current keywords if any
    if (selectedKeywords.length > 0) {
      // Small delay to let state update
      setTimeout(() => {
        handleKeywordSelect(selectedKeywords, selectedListName)
      }, 0)
    }
  }

  // Transform data for Word Cloud
  const wordCloudData: WordCloudWord[] = useMemo(() => {
    if (!searchResults) return []
    return Object.entries(searchResults.summary.keywordCounts)
      .filter(([_, count]) => count > 0)
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)
  }, [searchResults])

  // Transform data for Bar Chart
  const barChartData: KeywordBarData[] = useMemo(() => {
    if (!searchResults) return []
    return Object.entries(searchResults.summary.keywordCounts)
      .filter(([_, count]) => count > 0)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }, [searchResults])

  // Transform data for Heatmap
  const heatmapData = useMemo(() => {
    if (!searchResults) return { cells: [], keywords: [], documents: [] }

    const keywords = Object.entries(searchResults.summary.keywordCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k]) => k)

    const docs = searchResults.documents
      .filter((d) => d.totalMatches > 0)
      .slice(0, 15)
      .map((d) => ({ id: d.documentId, name: d.documentName }))

    const cells: HeatmapCell[] = []
    for (const doc of searchResults.documents) {
      for (const [keyword, match] of Object.entries(doc.matches)) {
        if (keywords.includes(keyword)) {
          cells.push({
            keyword,
            documentName: doc.documentName,
            documentId: doc.documentId,
            value: match.count,
          })
        }
      }
    }

    return { cells, keywords, documents: docs }
  }, [searchResults])

  // Transform data for Trend Line (year-over-year)
  const trendData = useMemo(() => {
    if (!searchResults) return { data: [], keywords: [] }

    // Group by year
    const yearData: Record<number, Record<string, number>> = {}
    const topKeywords = Object.entries(searchResults.summary.keywordCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k)

    for (const doc of searchResults.documents) {
      const year = doc.reportYear
      if (!year) continue
      if (!yearData[year]) {
        yearData[year] = {}
        topKeywords.forEach((k) => (yearData[year][k] = 0))
      }
      for (const [keyword, match] of Object.entries(doc.matches)) {
        if (topKeywords.includes(keyword)) {
          yearData[year][keyword] =
            (yearData[year][keyword] || 0) + match.count
        }
      }
    }

    const data: TrendDataPoint[] = Object.entries(yearData)
      .map(([year, keywords]) => ({
        year: parseInt(year),
        ...keywords,
      }))
      .sort((a, b) => a.year - b.year)

    return { data, keywords: topKeywords }
  }, [searchResults])

  // Transform data for Radar Chart (framework categories)
  const radarData = useMemo(() => {
    if (!searchResults || !selectedListName) return { data: [], dataKeys: [] }

    // Use hierarchical tier data if available
    if (hierarchicalResults) {
      const topTier = hierarchicalResults.hierarchy.tiers[0]
      const tierAgg = hierarchicalResults.overallTiers[topTier]
      if (tierAgg) {
        const data: RadarDataPoint[] = Object.entries(tierAgg).map(([category, agg]) => ({
          category,
          value: agg.matchCount,
        }))
        return {
          data,
          dataKeys: [{ key: 'value', name: topTier, color: '#3b82f6' }],
        }
      }
    }

    // Fallback: heuristic categorization
    const categories: Record<string, number> = {}
    for (const [keyword, count] of Object.entries(searchResults.summary.keywordCounts)) {
      if (count === 0) continue
      let category = 'Other'
      const lowerKeyword = keyword.toLowerCase()
      if (lowerKeyword.includes('carbon') || lowerKeyword.includes('emission') || lowerKeyword.includes('climate')) {
        category = 'Climate'
      } else if (lowerKeyword.includes('water') || lowerKeyword.includes('waste') || lowerKeyword.includes('energy')) {
        category = 'Environment'
      } else if (lowerKeyword.includes('diversity') || lowerKeyword.includes('employee') || lowerKeyword.includes('safety')) {
        category = 'Social'
      } else if (lowerKeyword.includes('governance') || lowerKeyword.includes('board') || lowerKeyword.includes('risk')) {
        category = 'Governance'
      } else if (lowerKeyword.includes('sustainable') || lowerKeyword.includes('esg')) {
        category = 'Sustainability'
      }
      categories[category] = (categories[category] || 0) + count
    }

    const data: RadarDataPoint[] = Object.entries(categories).map(([category, value]) => ({
      category,
      value,
    }))

    return {
      data,
      dataKeys: [{ key: 'value', name: selectedListName, color: '#3b82f6' }],
    }
  }, [searchResults, selectedListName, hierarchicalResults])

  // Transform data for Grouped Bar Chart (documents comparison)
  const groupedBarData = useMemo(() => {
    if (!searchResults) return { data: [], dataKeys: [] }

    const topKeywords = Object.entries(searchResults.summary.keywordCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k)

    const topDocs = searchResults.documents
      .filter((d) => d.totalMatches > 0)
      .slice(0, 8)

    const data: GroupedBarDataPoint[] = topDocs.map((doc) => {
      const point: GroupedBarDataPoint = {
        name: doc.documentName.length > 20
          ? doc.documentName.substring(0, 18) + '...'
          : doc.documentName,
      }
      for (const keyword of topKeywords) {
        point[keyword] = doc.matches[keyword]?.count || 0
      }
      return point
    })

    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
    const dataKeys = topKeywords.map((k, i) => ({
      key: k,
      name: k,
      color: colors[i % colors.length],
    }))

    return { data, dataKeys }
  }, [searchResults])

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <ProjectContextBar />
      <div className="p-8">

      {/* Analysis Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <DocumentFilter
              documents={documents}
              selectedIds={filteredDocIds}
              onChange={handleFilterChange}
            />
            {profile && (
              <Button
                variant="default"
                onClick={handleUseProfile}
                disabled={loadingProfile || analyzing}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Use Profile Keywords
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowKeywordSelector(true)}
            >
              Select Other Keywords
            </Button>
            {selectedKeywords.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedKeywords.length} keywords from {selectedListName}
              </span>
            )}
            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </div>
            )}
          </div>
          {!profile && !loadingProfile && (
            <p className="text-xs text-muted-foreground mt-2">
              No profile configured. Create a profile in project settings to save your keyword preferences.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      {searchResults ? (
        <Tabs defaultValue="wordcloud">
          <TabsList className="mb-4">
            <TabsTrigger value="wordcloud">
              <Cloud className="h-4 w-4 mr-2" />
              Word Cloud
            </TabsTrigger>
            <TabsTrigger value="bar">
              <BarChart3 className="h-4 w-4 mr-2" />
              Bar Chart
            </TabsTrigger>
            <TabsTrigger value="heatmap">
              <Grid3X3 className="h-4 w-4 mr-2" />
              Heatmap
            </TabsTrigger>
            <TabsTrigger value="trend">
              <TrendingUp className="h-4 w-4 mr-2" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="radar">
              <Radar className="h-4 w-4 mr-2" />
              Radar
            </TabsTrigger>
            <TabsTrigger value="grouped">
              <BarChart3 className="h-4 w-4 mr-2" />
              Comparison
            </TabsTrigger>
            {hierarchicalResults && (
              <TabsTrigger value="taxonomy">
                <Layers className="h-4 w-4 mr-2" />
                Taxonomy
              </TabsTrigger>
            )}
          </TabsList>

          {/* Word Cloud */}
          <TabsContent value="wordcloud">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Keyword Word Cloud</CardTitle>
                <ChartExportButton chartRef={wordCloudRef} filename="wordcloud" />
              </CardHeader>
              <CardContent>
                <div ref={wordCloudRef}>
                  <WordCloud words={wordCloudData} width={800} height={500} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bar Chart */}
          <TabsContent value="bar">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Top Keywords by Frequency</CardTitle>
                <ChartExportButton chartRef={barChartRef} filename="keyword-frequency" />
              </CardHeader>
              <CardContent>
                <div ref={barChartRef}>
                  <KeywordBarChart data={barChartData} height={500} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Heatmap */}
          <TabsContent value="heatmap">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Keywords x Documents Matrix</CardTitle>
                <ChartExportButton chartRef={heatmapRef} filename="keyword-heatmap" />
              </CardHeader>
              <CardContent>
                <div ref={heatmapRef}>
                  <KeywordHeatmap
                    data={heatmapData.cells}
                    keywords={heatmapData.keywords}
                    documents={heatmapData.documents}
                    height={500}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trend Line */}
          <TabsContent value="trend">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Year-over-Year Keyword Trends</CardTitle>
                <ChartExportButton chartRef={trendChartRef} filename="keyword-trends" />
              </CardHeader>
              <CardContent>
                <div ref={trendChartRef}>
                  {trendData.data.length > 1 ? (
                    <TrendLineChart
                      data={trendData.data}
                      keywords={trendData.keywords}
                      height={400}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                      Need documents from multiple years to show trends.
                      <br />
                      Add report year metadata to your documents.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Radar Chart */}
          <TabsContent value="radar">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Category Coverage</CardTitle>
                <ChartExportButton chartRef={radarChartRef} filename="category-radar" />
              </CardHeader>
              <CardContent>
                <div ref={radarChartRef}>
                  <FrameworkRadarChart
                    data={radarData.data}
                    dataKeys={radarData.dataKeys}
                    height={450}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Grouped Bar Chart */}
          <TabsContent value="grouped">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Document Comparison</CardTitle>
                <ChartExportButton chartRef={groupedBarRef} filename="document-comparison" />
              </CardHeader>
              <CardContent>
                <div ref={groupedBarRef}>
                  <GroupedBarChart
                    data={groupedBarData.data}
                    dataKeys={groupedBarData.dataKeys}
                    height={450}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Taxonomy Charts (hierarchical only) */}
          {hierarchicalResults && (
            <TabsContent value="taxonomy">
              <div className="space-y-6">
                {/* Treemap for each tier */}
                {hierarchicalResults.hierarchy.tiers.map(tierName => (
                  <Card key={tierName}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{tierName} Distribution</CardTitle>
                      <ChartExportButton chartRef={taxonomyTreemapRef} filename={`taxonomy-${tierName.toLowerCase()}`} />
                    </CardHeader>
                    <CardContent>
                      <div ref={tierName === hierarchicalResults.hierarchy.tiers[0] ? taxonomyTreemapRef : undefined}>
                        <TaxonomyTreemap
                          tierAggregation={hierarchicalResults.overallTiers[tierName]}
                          tierName={tierName}
                          height={400}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Stacked bar: documents x top tier */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Documents by {hierarchicalResults.hierarchy.tiers[0]}</CardTitle>
                    <ChartExportButton chartRef={taxonomyBarRef} filename="taxonomy-documents" />
                  </CardHeader>
                  <CardContent>
                    <div ref={taxonomyBarRef}>
                      <TaxonomyStackedBar
                        hierarchicalResults={hierarchicalResults}
                        tierName={hierarchicalResults.hierarchy.tiers[0]}
                        height={450}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Select Keywords to Visualize</h2>
            <p className="text-muted-foreground mb-4">
              {profile
                ? 'Use your profile keywords or select a different framework to generate visualizations'
                : 'Choose a keyword framework to generate visualizations of keyword distribution across your documents'}
            </p>
            <div className="flex items-center justify-center gap-2">
              {profile && (
                <Button onClick={handleUseProfile}>
                  <Settings2 className="h-4 w-4 mr-2" />
                  Use Profile Keywords
                </Button>
              )}
              <Button
                variant={profile ? 'outline' : 'default'}
                onClick={() => setShowKeywordSelector(true)}
              >
                {profile ? 'Select Other Keywords' : 'Select Keywords'}
              </Button>
            </div>
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
