import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const HELP_SECTIONS = [
  { id: 'user-guide', title: 'User Guide', icon: '📖' },
  { id: 'analysis-workflows', title: 'Analysis Workflows', icon: '🔍' },
  { id: 'keyword-methodology', title: 'Keyword Methodology', icon: '🔬' },
  { id: 'quick-reference', title: 'Quick Reference', icon: '⚡' },
  { id: 'collaboration', title: 'Collaboration', icon: '👥' },
]

export function Help() {
  const { section = 'user-guide' } = useParams<{ section?: string }>()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [allContent, setAllContent] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ section: string; matches: number; preview: string }>>([])

  // Load all documentation on mount for search
  useEffect(() => {
    const loadAllDocs = async () => {
      const docs: Record<string, string> = {}
      for (const sec of HELP_SECTIONS) {
        try {
          const response = await fetch(`./docs/${sec.id}.md`)
          if (response.ok) {
            docs[sec.id] = await response.text()
          }
        } catch (err) {
          console.error(`Failed to load ${sec.id}:`, err)
        }
      }
      setAllContent(docs)
    }
    loadAllDocs()
  }, [])

  // Load current section
  useEffect(() => {
    setLoading(true)
    setContent('')

    // Load markdown file from public/docs directory
    fetch(`./docs/${section}.md`)
      .then(response => {
        if (!response.ok) throw new Error('File not found')
        return response.text()
      })
      .then(text => {
        setContent(text)
        setLoading(false)
      })
      .catch(error => {
        console.error('Failed to load help content:', error)
        setContent('# Help Not Found\n\nSorry, this help section could not be loaded.')
        setLoading(false)
      })
  }, [section])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + ? to open help
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '?') {
        navigate('/help')
      }
      // Cmd/Ctrl + / for search focus (or just / on help page)
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
        searchInput?.focus()
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('')
        setSearchResults([])
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [navigate, searchQuery])

  // Search implementation
  const performSearch = (query: string) => {
    setSearchQuery(query)

    if (query.trim().length < 2) {
      setSearchResults([])
      return
    }

    const results: Array<{ section: string; matches: number; preview: string }> = []
    const lowerQuery = query.toLowerCase()

    Object.entries(allContent).forEach(([secId, text]) => {
      const matches = (text.match(new RegExp(lowerQuery, 'gi')) || []).length
      if (matches > 0) {
        // Find a preview snippet around first match
        const index = text.toLowerCase().indexOf(lowerQuery)
        const start = Math.max(0, index - 50)
        const end = Math.min(text.length, index + query.length + 50)
        const preview = text.substring(start, end).replace(/\n/g, ' ')

        results.push({
          section: secId,
          matches,
          preview: `...${preview}...`
        })
      }
    })

    // Sort by most matches
    results.sort((a, b) => b.matches - a.matches)
    setSearchResults(results)
  }

  // Simple search highlighting in future - for now just show all content
  const displayContent = content

  return (
    <div className="min-h-screen bg-background">
      {/* Header — masthead */}
      <div className="bg-card border-b border-border px-8 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/">
            <Button variant="ghost" size="icon" className="-ml-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="label-masthead">The Reading Room · Appendix</div>
        </div>
        <h1 className="font-display text-3xl font-medium leading-none tracking-tight mb-4">
          Help &amp; <span className="italic">Documentation</span>
        </h1>

        {/* Search */}
        <div className="flex items-center gap-2 max-w-md relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-2" />
          <Input
            placeholder="Search documentation... (Cmd/Ctrl + /)"
            value={searchQuery}
            onChange={(e) => performSearch(e.target.value)}
            data-search-input
            className="h-8 text-sm pl-8"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSearchResults([])
              }}
              className="absolute right-2 hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-muted border-r min-h-screen p-4 sticky top-16">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-4">
              Documentation
            </p>
            {HELP_SECTIONS.map(s => {
              const isActive = section === s.id
              return (
                <Link
                  key={s.id}
                  to={`/help/${s.id}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-background text-foreground'
                  }`}
                >
                  <span>{s.icon}</span>
                  <span>{s.title}</span>
                </Link>
              )
            })}
          </div>

          {/* Help Info */}
          <div className="mt-8 p-3 bg-background rounded-lg border">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Use the breadcrumbs at the top to navigate back to the main app.
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-8 max-w-4xl">
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm font-semibold mb-3">
                Found {searchResults.reduce((sum, r) => sum + r.matches, 0)} results in {searchResults.length} section(s):
              </p>
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <Link
                    key={result.section}
                    to={`/help/${result.section}`}
                    onClick={() => setSearchQuery('')}
                    className="block p-2 hover:bg-muted rounded transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-primary">
                          {HELP_SECTIONS.find(s => s.id === result.section)?.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {result.preview}
                        </p>
                      </div>
                      <span className="text-xs bg-primary/10 px-2 py-1 rounded ml-2 flex-shrink-0">
                        {result.matches} match{result.matches > 1 ? 'es' : ''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-48" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-3/4" />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node, ...props }) => (
                    <h1 className="font-display text-4xl font-medium tracking-tight mt-10 mb-4 first:mt-0 pb-2 border-b-2 border-foreground" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="font-display text-2xl font-medium tracking-tight mt-10 mb-3" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="font-display text-xl font-medium mt-8 mb-2" {...props} />
                  ),
                  h4: ({ node, ...props }) => (
                    <h4 className="font-display text-lg font-medium mt-6 mb-2" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="text-muted-foreground leading-relaxed mb-3" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc list-inside space-y-1 my-3 text-muted-foreground" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal list-inside space-y-1 my-3 text-muted-foreground" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="ml-2" {...props} />
                  ),
                  blockquote: ({ node, ...props }) => (
                    <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground my-3" {...props} />
                  ),
                  code: ({ node, className, children, ...props }) => {
                    // Check if this is inline code (no className means inline)
                    const isInline = !className
                    if (isInline) {
                      return (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props}>
                          {children}
                        </code>
                      )
                    }
                    return <code className={className} {...props}>{children}</code>
                  },
                  pre: ({ node, ...props }) => (
                    <pre className="bg-muted p-4 rounded-lg overflow-auto my-3" {...props} />
                  ),
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="w-full border-collapse border border-muted" {...props} />
                    </div>
                  ),
                  th: ({ node, ...props }) => (
                    <th className="border border-muted px-3 py-2 bg-muted text-left font-semibold" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="border border-muted px-3 py-2" {...props} />
                  ),
                  a: ({ node, ...props }) => (
                    <a className="text-primary hover:underline" {...props} />
                  ),
                  hr: ({ node, ...props }) => (
                    <hr className="my-6 border-muted" {...props} />
                  ),
                  img: ({ node, ...props }) => (
                    <img className="max-w-full h-auto rounded-lg my-3" {...props} />
                  ),
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {/* Navigation Between Sections */}
          <div className="mt-12 pt-6 border-t space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>More documentation:</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              {HELP_SECTIONS.map(s => {
                const isCurrent = section === s.id
                return (
                  <Link key={s.id} to={`/help/${s.id}`}>
                    <Button
                      variant={isCurrent ? 'default' : 'outline'}
                      size="sm"
                    >
                      {s.icon} {s.title}
                    </Button>
                  </Link>
                )
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
