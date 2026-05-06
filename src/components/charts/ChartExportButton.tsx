import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChartExportButtonProps {
  chartRef: React.RefObject<HTMLDivElement>
  filename?: string
}

export function ChartExportButton({
  chartRef,
  filename = 'chart',
}: ChartExportButtonProps) {
  const handleExport = async (format: 'png' | 'svg') => {
    if (!chartRef.current) return

    try {
      // Find SVG element in the chart container
      const svgElement = chartRef.current.querySelector('svg')
      if (!svgElement) {
        alert('Chart export is only supported for SVG-based charts')
        return
      }

      // Show save dialog
      const result = await window.electron.saveFileDialog({
        title: `Export as ${format.toUpperCase()}`,
        defaultPath: `${filename}.${format}`,
        filters: [
          format === 'svg'
            ? { name: 'SVG Image', extensions: ['svg'] }
            : { name: 'PNG Image', extensions: ['png'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return
      }

      if (format === 'svg') {
        // Export as SVG
        const svgData = new XMLSerializer().serializeToString(svgElement)
        await window.electron.writeFile(result.filePath, svgData)
      } else {
        // Export as PNG
        const svgData = new XMLSerializer().serializeToString(svgElement)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          alert('Canvas not supported')
          return
        }

        const img = new Image()
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)

        await new Promise<void>((resolve, reject) => {
          img.onload = async () => {
            try {
              // Scale up for better quality
              const scale = 2
              canvas.width = svgElement.clientWidth * scale
              canvas.height = svgElement.clientHeight * scale
              ctx.scale(scale, scale)

              // White background
              ctx.fillStyle = 'white'
              ctx.fillRect(0, 0, canvas.width, canvas.height)

              ctx.drawImage(img, 0, 0)

              // Convert to blob and save
              canvas.toBlob(async (blob) => {
                if (blob) {
                  const arrayBuffer = await blob.arrayBuffer()
                  await window.electron.writeFile(result.filePath!, arrayBuffer)
                  resolve()
                } else {
                  reject(new Error('Failed to create PNG blob'))
                }
              }, 'image/png')

              URL.revokeObjectURL(url)
            } catch (err) {
              reject(err)
            }
          }

          img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Failed to load SVG image'))
          }

          img.src = url
        })
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export chart')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('png')}
        title="Export as PNG"
      >
        <Download className="h-4 w-4 mr-1" />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('svg')}
        title="Export as SVG"
      >
        <Download className="h-4 w-4 mr-1" />
        SVG
      </Button>
    </div>
  )
}
