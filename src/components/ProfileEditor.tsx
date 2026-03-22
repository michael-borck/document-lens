/**
 * ProfileEditor Component
 *
 * Full editor for the project's research profile configuration including:
 * - Keyword framework selections
 * - Custom domains for domain mapping
 * - Analysis type preferences
 * - Comparison settings
 *
 * Each project has exactly one profile that persists across sessions.
 */

import { useState, useEffect } from 'react'
import { Settings2, Loader2, Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  getOrCreateProjectProfile,
  updateProfile,
  createDefaultProfileConfig,
  type ProfileConfig,
  type ParsedAnalysisProfile,
} from '@/services/profiles'
import { getAllKeywordLists, parseKeywords, flattenKeywords, type KeywordList } from '@/services/keywords'

interface ProfileEditorProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectName?: string
  onSaved?: () => void
}

export function ProfileEditor({
  open,
  onClose,
  projectId,
  projectName,
  onSaved,
}: ProfileEditorProps) {
  const [profile, setProfile] = useState<ParsedAnalysisProfile | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState<ProfileConfig>(createDefaultProfileConfig())
  const [keywordLists, setKeywordLists] = useState<KeywordList[]>([])
  const [expandedFrameworks, setExpandedFrameworks] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')

  useEffect(() => {
    if (open) {
      loadProfile()
      loadKeywordLists()
    }
  }, [open, projectId])

  const loadProfile = async () => {
    try {
      setLoading(true)
      // Get or create the project's single profile
      const existingProfile = await getOrCreateProjectProfile(projectId, projectName)
      setProfile(existingProfile)
      setName(existingProfile.name)
      setDescription(existingProfile.description || '')
      setConfig(existingProfile.config)
    } catch (error) {
      console.error('Failed to load profile:', error)
      // Use defaults if profile load fails
      setName(projectName ? `${projectName} Profile` : 'Research Profile')
      setDescription('')
      setConfig(createDefaultProfileConfig())
    } finally {
      setLoading(false)
    }
  }

  const loadKeywordLists = async () => {
    try {
      setLoading(true)
      const lists = await getAllKeywordLists()
      setKeywordLists(lists)
    } catch (error) {
      console.error('Failed to load keyword lists:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !profile) return

    try {
      setSaving(true)

      await updateProfile(profile.id, {
        name: name.trim(),
        description: description.trim() || null,
        config,
      })

      onSaved?.()
      onClose()
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const toggleFramework = (framework: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      keywords: {
        ...prev.keywords,
        [framework]: {
          ...prev.keywords[framework],
          enabled,
        },
      },
    }))
  }

  const toggleKeyword = (framework: string, keyword: string) => {
    setConfig((prev) => {
      const current = prev.keywords[framework]?.selected || []
      const updated = current.includes(keyword)
        ? current.filter((k) => k !== keyword)
        : [...current, keyword]

      return {
        ...prev,
        keywords: {
          ...prev.keywords,
          [framework]: {
            ...prev.keywords[framework],
            selected: updated,
          },
        },
      }
    })
  }

  const selectAllKeywords = (framework: string, keywords: string[]) => {
    setConfig((prev) => ({
      ...prev,
      keywords: {
        ...prev.keywords,
        [framework]: {
          ...prev.keywords[framework],
          selected: keywords,
        },
      },
    }))
  }

  const clearKeywords = (framework: string) => {
    setConfig((prev) => ({
      ...prev,
      keywords: {
        ...prev.keywords,
        [framework]: {
          ...prev.keywords[framework],
          selected: [],
        },
      },
    }))
  }

  const toggleAnalysisType = (type: keyof ProfileConfig['analysis_types']) => {
    setConfig((prev) => ({
      ...prev,
      analysis_types: {
        ...prev.analysis_types,
        [type]: !prev.analysis_types[type],
      },
    }))
  }

  const addDomain = () => {
    if (!newDomain.trim()) return
    if (config.domains.includes(newDomain.trim())) return

    setConfig((prev) => ({
      ...prev,
      domains: [...prev.domains, newDomain.trim()],
    }))
    setNewDomain('')
  }

  const removeDomain = (domain: string) => {
    setConfig((prev) => ({
      ...prev,
      domains: prev.domains.filter((d) => d !== domain),
    }))
  }

  const toggleExpandFramework = (framework: string) => {
    setExpandedFrameworks((prev) => {
      const next = new Set(prev)
      if (next.has(framework)) {
        next.delete(framework)
      } else {
        next.add(framework)
      }
      return next
    })
  }

  const getKeywordsForList = (list: KeywordList): string[] => {
    try {
      const parsed = parseKeywords(list)
      return flattenKeywords(parsed.keywords)
    } catch {
      return []
    }
  }

  // Use list ID as the config key for keyword selections
  const getConfigKey = (list: KeywordList): string => {
    return list.framework && list.framework !== 'custom' ? list.framework : list.id
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Research Profile Settings
          </DialogTitle>
          <DialogDescription>
            Configure your research lens - keyword selections, domains, and analysis preferences.
            These settings persist across sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Profile Name</label>
              <Input
                placeholder="e.g., Climate Focus, ESG Analysis"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="Brief description of this profile's focus"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Tabs for different sections */}
          <Tabs defaultValue="keywords" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="keywords" className="flex-1">Keywords</TabsTrigger>
              <TabsTrigger value="domains" className="flex-1">Domains</TabsTrigger>
              <TabsTrigger value="analysis" className="flex-1">Analysis</TabsTrigger>
            </TabsList>

            {/* Keywords Tab */}
            <TabsContent value="keywords" className="mt-4 space-y-4">
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : (
                <>
                  {/* Built-in frameworks */}
                  {keywordLists.filter(l => l.is_builtin).map((list) => {
                    const configKey = getConfigKey(list)
                    const keywords = getKeywordsForList(list)
                    const selected = config.keywords[configKey]?.selected || []
                    const enabled = config.keywords[configKey]?.enabled ?? false
                    const expanded = expandedFrameworks.has(configKey)

                    return (
                      <div key={list.id} className="border rounded-lg">
                        <div className="flex items-center gap-3 p-3 bg-muted/50">
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              toggleFramework(configKey, checked === true)
                            }
                          />
                          <button
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => toggleExpandFramework(configKey)}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="font-medium">{list.name}</span>
                            <span className="text-sm text-muted-foreground">
                              ({selected.length}/{keywords.length} selected)
                            </span>
                          </button>
                          {enabled && expanded && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => selectAllKeywords(configKey, keywords)}
                              >
                                All
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => clearKeywords(configKey)}
                              >
                                None
                              </Button>
                            </div>
                          )}
                        </div>

                        {enabled && expanded && (
                          <div className="p-3 max-h-48 overflow-y-auto">
                            <div className="flex flex-wrap gap-2">
                              {keywords.map((keyword) => (
                                <label
                                  key={keyword}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                                    selected.includes(keyword)
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted hover:bg-muted/80'
                                  }`}
                                >
                                  <Checkbox
                                    checked={selected.includes(keyword)}
                                    onCheckedChange={() =>
                                      toggleKeyword(configKey, keyword)
                                    }
                                    className="h-3 w-3"
                                  />
                                  <span>{keyword}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Custom lists */}
                  {keywordLists.filter(l => !l.is_builtin).length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                        Custom Lists
                      </div>
                      {keywordLists.filter(l => !l.is_builtin).map((list) => {
                        const configKey = getConfigKey(list)
                        const keywords = getKeywordsForList(list)
                        const selected = config.keywords[configKey]?.selected || []
                        const enabled = config.keywords[configKey]?.enabled ?? false
                        const expanded = expandedFrameworks.has(configKey)

                        return (
                          <div key={list.id} className="border rounded-lg">
                            <div className="flex items-center gap-3 p-3 bg-muted/50">
                              <Checkbox
                                checked={enabled}
                                onCheckedChange={(checked) =>
                                  toggleFramework(configKey, checked === true)
                                }
                              />
                              <button
                                className="flex items-center gap-2 flex-1 text-left"
                                onClick={() => toggleExpandFramework(configKey)}
                              >
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                <span className="font-medium">{list.name}</span>
                                <span className="text-sm text-muted-foreground">
                                  ({selected.length}/{keywords.length} selected)
                                </span>
                              </button>
                              {enabled && expanded && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => selectAllKeywords(configKey, keywords)}
                                  >
                                    All
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => clearKeywords(configKey)}
                                  >
                                    None
                                  </Button>
                                </div>
                              )}
                            </div>

                            {enabled && expanded && (
                              <div className="p-3 max-h-48 overflow-y-auto">
                                <div className="flex flex-wrap gap-2">
                                  {keywords.map((keyword) => (
                                    <label
                                      key={keyword}
                                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                                        selected.includes(keyword)
                                          ? 'bg-primary/10 text-primary'
                                          : 'bg-muted hover:bg-muted/80'
                                      }`}
                                    >
                                      <Checkbox
                                        checked={selected.includes(keyword)}
                                        onCheckedChange={() =>
                                          toggleKeyword(configKey, keyword)
                                        }
                                        className="h-3 w-3"
                                      />
                                      <span>{keyword}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </>
              )}
            </TabsContent>

            {/* Domains Tab */}
            <TabsContent value="domains" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Define custom domains for semantic analysis (e.g., Governance, Strategy,
                Risk Management). These are used for domain mapping and comparison.
              </p>

              <div className="flex gap-2">
                <Input
                  placeholder="Add domain (e.g., Governance)"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                />
                <Button onClick={addDomain} disabled={!newDomain.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {config.domains.map((domain) => (
                  <span
                    key={domain}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
                  >
                    {domain}
                    <button
                      onClick={() => removeDomain(domain)}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {config.domains.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No domains defined yet
                  </span>
                )}
              </div>

              {/* Preset suggestions */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Quick Presets:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['TCFD Pillars', ['Governance', 'Strategy', 'Risk Management', 'Metrics & Targets']],
                    ['ESG Categories', ['Environmental', 'Social', 'Governance']],
                    ['Academic Roles', ['Teaching', 'Research', 'Service', 'Administration']],
                  ].map(([name, domains]) => (
                    <Button
                      key={name as string}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          domains: domains as string[],
                        }))
                      }
                    >
                      {name}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="mt-4 space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">Analysis Types</p>
                {[
                  { key: 'sentiment', label: 'Sentiment Analysis', description: 'Analyze positive/negative tone' },
                  { key: 'domain_mapping', label: 'Domain Mapping', description: 'Map content to defined domains' },
                  { key: 'structural_mismatch', label: 'Structural Mismatch', description: 'Detect thematic dislocation' },
                  { key: 'readability', label: 'Readability', description: 'Flesch scores and grade levels' },
                  { key: 'writing_quality', label: 'Writing Quality', description: 'Passive voice, sentence variety' },
                ].map(({ key, label, description }) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={config.analysis_types[key as keyof ProfileConfig['analysis_types']]}
                      onCheckedChange={() =>
                        toggleAnalysisType(key as keyof ProfileConfig['analysis_types'])
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium">{label}</div>
                      <div className="text-sm text-muted-foreground">{description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving || loading || !profile}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4 mr-2" />
            )}
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
