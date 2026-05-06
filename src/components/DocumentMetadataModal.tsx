import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateDocumentMetadata, type DocumentRecord } from '@/services/documents'

interface DocumentMetadataModalProps {
  open: boolean
  onClose: () => void
  document: DocumentRecord | null
  onSaved: () => void
}

interface Country {
  code: string
  name: string
}

interface Industry {
  id: string
  name: string
}

export function DocumentMetadataModal({
  open,
  onClose,
  document,
  onSaved,
}: DocumentMetadataModalProps) {
  const [companyName, setCompanyName] = useState('')
  const [reportYear, setReportYear] = useState('')
  const [industry, setIndustry] = useState('')
  const [country, setCountry] = useState('')
  const [reportType, setReportType] = useState('')
  const [saving, setSaving] = useState(false)

  const [countries, setCountries] = useState<Country[]>([])
  const [industries, setIndustries] = useState<Industry[]>([])

  useEffect(() => {
    loadReferenceData()
  }, [])

  useEffect(() => {
    if (document) {
      setCompanyName(document.company_name || '')
      setReportYear(document.report_year?.toString() || '')
      setIndustry(document.industry || '')
      setCountry(document.country || '')
      setReportType(document.report_type || '')
    }
  }, [document])

  const loadReferenceData = async () => {
    try {
      const [countryData, industryData] = await Promise.all([
        window.electron.dbQuery<Country>('SELECT code, name FROM countries ORDER BY name'),
        window.electron.dbQuery<Industry>('SELECT id, name FROM industries ORDER BY name'),
      ])
      setCountries(countryData)
      setIndustries(industryData)
    } catch (error) {
      console.error('Failed to load reference data:', error)
    }
  }

  const handleSave = async () => {
    if (!document) return

    setSaving(true)
    try {
      await updateDocumentMetadata(document.id, {
        company_name: companyName || null,
        report_year: reportYear ? parseInt(reportYear, 10) : null,
        industry: industry || null,
        country: country || null,
        report_type: reportType || null,
      })
      onSaved()
      onClose()
    } catch (error) {
      console.error('Failed to save metadata:', error)
    } finally {
      setSaving(false)
    }
  }

  const reportTypes = [
    'Annual Report',
    'Sustainability Report',
    'CSR Report',
    'ESG Report',
    'Integrated Report',
    'Climate Report',
    'Impact Report',
    'Other',
  ]

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i)

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Document Metadata</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Filename</label>
            <p className="text-sm text-muted-foreground truncate">
              {document?.filename}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Company Name</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter company name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Report Year</label>
              <Select value={reportYear} onValueChange={setReportYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {reportTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Industry</label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((ind) => (
                    <SelectItem key={ind.id} value={ind.id}>
                      {ind.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Country</label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
