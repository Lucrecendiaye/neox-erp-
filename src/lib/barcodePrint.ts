import type { Product } from '@/types'
import { formatCurrency } from './utils'

export function printBarcodeLabels(products: Product[], cols = 3, rows = 8) {
  const labelW = 70
  const labelH = 40
  const canvas = document.createElement('canvas')
  canvas.width = cols * labelW
  canvas.height = rows * labelH
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  products.forEach((product, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    if (row >= rows) return

    const x = col * labelW
    const y = row * labelH

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x, y, labelW, labelH)
    ctx.strokeStyle = '#E2E8F0'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, labelW, labelH)

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 9px sans-serif'
    ctx.textBaseline = 'top'
    const name = product.name.length > 18 ? product.name.slice(0, 16) + '..' : product.name
    ctx.fillText(name, x + 3, y + 3)

    ctx.fillStyle = '#475569'
    ctx.font = '7px sans-serif'
    if (product.barcode) {
      ctx.fillText(product.barcode, x + 3, y + 14)
    }

    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText(formatCurrency(product.sellingPrice), x + 3, y + 24)

    if (product.barcode) {
      ctx.fillStyle = '#000000'
      const barcodeText = product.barcode
      let bx = x + 3
      for (let i = 0; i < barcodeText.length; i++) {
        const width = barcodeText.charCodeAt(i) % 2 === 0 ? 1.5 : 1
        ctx.fillRect(bx, y + 33, width, 5)
        bx += width + 0.5
      }
    }
  })

  const printWindow = window.open('', '', 'width=800,height=600')
  if (!printWindow) return
  printWindow.document.write(`
    <html>
    <head>
      <title>Impression étiquettes</title>
      <style>
        body { margin: 0; padding: 10px; }
        img { display: block; max-width: 100%; }
        @media print {
          @page { margin: 5mm; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <img src="${canvas.toDataURL()}" />
      <script>setTimeout(function(){ window.print(); window.close(); }, 300)</script>
    </body>
    </html>
  `)
  printWindow.document.close()
}
