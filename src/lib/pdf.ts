import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, Sale } from '@/types'
import type { Transfer, TransferItem, BonSortie } from '@/engine/types'
import type { CompanySettings } from '@/types'

const BLUE = '#1e40af'
const RED = '#dc2626'
const WHITE = '#ffffff'
const GRAY = '#64748b'
const LIGHT_GRAY = '#f1f5f9'

function fmt(amount: number): string {
  const parts = Math.round(amount).toString().split('').reverse().join('')
  const grouped = parts.match(/.{1,3}/g)?.join('.').split('').reverse().join('') || '0'
  return `${grouped} FCFA`
}

function rect(doc: jsPDF, x: number, y: number, w: number, h: number, color: string, radius = 0) {
  doc.setFillColor(color as any)
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius, radius, 'F')
  } else {
    doc.rect(x, y, w, h, 'F')
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

const PW = 148
const PH = 210
const M = 8

function drawBanner(doc: jsPDF, settings: CompanySettings) {
  rect(doc, 0, 0, PW, 44, BLUE)

  doc.setTextColor(255, 255, 255)

  if (settings.logo) {
    try { doc.addImage(settings.logo, 'JPEG', M, 5, 16, 16) } catch { try { doc.addImage(settings.logo, 'PNG', M, 5, 16, 16) } catch {} }
  }

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(settings.name || 'Boutique', M + (settings.logo ? 28 : 0), 13)

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  let lx = M + (settings.logo ? 28 : 0)
  let iy = 18
  if (settings.slogan) { doc.text(settings.slogan, lx, iy); iy += 4 }
  if (settings.address) { doc.text(settings.address, lx, iy); iy += 3.5 }
  if (settings.phone) { doc.text(`Tel: ${settings.phone}`, lx, iy); iy += 3.5 }
  if (settings.email) { doc.text(settings.email, lx, iy); iy += 3.5 }
  if (settings.website) { doc.text(settings.website, lx, iy); iy += 3.5 }
  if (settings.ninea) { doc.text(`NINEA: ${settings.ninea}`, lx, iy); iy += 3.5 }
  if (settings.rccm) { doc.text(`RCCM: ${settings.rccm}`, lx, iy) }
}

function drawInvoiceBadge(doc: jsPDF, sale: Sale, y: number) {
  const bw = 60
  const bh = 28
  const x = PW - M - bw

  rect(doc, x, y, bw, bh, WHITE, 3)
  doc.setDrawColor(...hexToRgb(BLUE))
  doc.setLineWidth(0.4)
  doc.roundedRect(x, y, bw, bh, 3, 3, 'S')

  doc.setTextColor(...hexToRgb(BLUE))
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('FACTURE', x + bw / 2, y + 8, { align: 'center' })

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`No ${sale.invoiceNumber || 'N/A'}`, x + bw / 2, y + 14, { align: 'center' })

  const d = new Date(sale.createdAt)
  doc.text(`${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, x + bw / 2, y + 18.5, { align: 'center' })

  const status = sale.paid >= sale.total ? 'paid'
    : sale.paymentMethod === 'credit' && sale.paid > 0 ? 'partial'
    : sale.paymentMethod === 'credit' ? 'credit'
    : sale.status === 'cancelled' ? 'cancelled' : 'paid'

  const sc: Record<string, { bg: string; text: string; label: string }> = {
    paid: { bg: '#dbeafe', text: '#1e40af', label: 'Payee' },
    partial: { bg: '#fef3c7', text: '#d97706', label: 'Partielle' },
    credit: { bg: '#fee2e2', text: '#dc2626', label: 'Non payee' },
    cancelled: { bg: '#f1f5f9', text: '#64748b', label: 'Annulee' },
  }
  const s = sc[status]
  if (s) {
    rect(doc, x + bw / 2 - 14, y + 22.5, 28, 4.5, s.bg, 2)
    doc.setTextColor(...hexToRgb(s.text))
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'bold')
    doc.text(s.label, x + bw / 2, y + 26, { align: 'center' })
  }
}

function drawInfoCards(doc: jsPDF, sale: Sale, settings: CompanySettings, startY: number): number {
  const cw = (PW - M * 3) / 2

  function drawCard(x: number, y: number, w: number, title: string, lines: string[]) {
    rect(doc, x, y, w, 8 + lines.length * 4.5, LIGHT_GRAY, 3)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...hexToRgb(BLUE))
    doc.text(title, x + 4, y + 6)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    lines.forEach((line, i) => { doc.text(line, x + 4, y + 11 + i * 4.5) })
  }

  const emitter = [
    settings.managerName ? `Resp: ${settings.managerName}` : '',
    settings.address || '',
    settings.phone ? `Tel: ${settings.phone}` : '',
    settings.email ? `Email: ${settings.email}` : '',
  ].filter(Boolean)

  const saleTypeLabel = sale.paymentMethod === 'credit'
    ? (sale.paid > 0 ? 'Credit partiel' : 'Credit total')
    : 'Comptant'

  const client = [
    sale.customerName || 'Client divers',
    `Tel: ...`,
    `Paiement: ${saleTypeLabel}`,
    sale.paid < sale.total ? `Reste: ${fmt(sale.total - sale.paid)}` : '',
  ].filter(Boolean)

  drawCard(M, startY, cw, 'EMETTEUR', emitter)
  drawCard(M + cw + M, startY, cw, 'CLIENT', client)

  return startY + Math.max(emitter.length, client.length) * 4.5 + 14
}

function formatPaymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    cash: 'Comptant', card: 'Carte', mobile: 'Mobile Money',
    credit: 'Crédit', bank: 'Virement', split: 'Mixte',
  }
  return map[method] || method
}

function getPaymentStatusLabel(sale: Sale): string {
  if (sale.status === 'cancelled') return 'Annulée'
  if (sale.paid >= sale.total) return 'Payée'
  if (sale.paymentMethod === 'credit') {
    if (sale.paid > 0) return 'Crédit partiel'
    return 'Crédit total'
  }
  if (sale.paid > 0 && sale.paid < sale.total) return 'Partielle'
  return 'En attente'
}

export function exportSalePDF(sale: Sale, settings?: CompanySettings) {
  const doc = new jsPDF({ format: 'a5' })
  const s = settings || {} as CompanySettings

  drawBanner(doc, s)

  drawInvoiceBadge(doc, sale, 8)

  let yPos = 50
  yPos = drawInfoCards(doc, sale, s, yPos) + 2

  const rows = sale.items.map(item => [
    item.productName,
    item.quantity.toLocaleString('fr-FR'),
    item.unitName || 'p',
    fmt(item.unitPrice),
    item.discount > 0 ? fmt(item.discount) : '-',
    fmt(item.total),
  ])

  const colW = (PW - M * 2) / 6

  autoTable(doc, {
    startY: yPos,
    head: [['Designation', 'Qte', 'Unite', 'P/U', 'Remise', 'Montant']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: hexToRgb(BLUE), textColor: 255, fontSize: 6.5, fontStyle: 'bold', halign: 'center' as any },
    bodyStyles: { fontSize: 6 },
    columnStyles: {
      0: { cellWidth: 'auto' as any },
      1: { halign: 'center' as any, cellWidth: 12 },
      2: { halign: 'center' as any, cellWidth: 12 },
      3: { halign: 'right' as any, cellWidth: colW - 2 },
      4: { halign: 'center' as any, cellWidth: 18 },
      5: { halign: 'right' as any, cellWidth: colW },
    },
    margin: { left: M, right: M },
    tableLineColor: hexToRgb(LIGHT_GRAY),
    tableLineWidth: 0.3,
    styles: { cellPadding: 1.5 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 4

  const subtotal = sale.subtotal || sale.items.reduce((s, i) => s + i.total, 0)
  const discountTotal = sale.discountTotal || sale.items.reduce((s, i) => s + i.discount, 0)
  const taxTotal = sale.taxTotal || 0
  const total = sale.total

  const summaryX = M
  const summaryW = PW / 2 - M * 1.5
  const summaryStart = finalY
  const lh = 5

  const summaryLines: { label: string; value: string; bold?: boolean; color?: string }[] = [
    { label: 'Sous-total HT', value: fmt(subtotal) },
    { label: 'Remise totale', value: `- ${fmt(discountTotal)}`, color: RED },
  ]
  if (taxTotal > 0) summaryLines.push({ label: 'Taxe', value: fmt(taxTotal) })
  summaryLines.push({ label: '', value: '' })
  summaryLines.push({ label: 'TOTAL TTC', value: fmt(total), bold: true })

  const tH = summaryLines.length * lh + 10

  rect(doc, summaryX, summaryStart - 2, summaryW, tH, LIGHT_GRAY, 4)

  summaryLines.forEach((line, i) => {
    const ly = summaryStart + i * lh + 2
    if (line.bold) {
      rect(doc, summaryX, ly - 1, summaryW, lh + 3, BLUE, 3)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(line.label, summaryX + 5, ly + 4)
      doc.text(line.value, summaryX + summaryW - 5, ly + 4, { align: 'right' })
    } else if (line.label) {
      doc.setFontSize(6)
      doc.setFont('helvetica', 'normal')
      const lc = line.color ? hexToRgb(line.color) : [60, 60, 60] as const
      doc.setTextColor(lc[0], lc[1], lc[2])
      doc.text(line.label, summaryX + 5, ly + 3)
      doc.text(line.value, summaryX + summaryW - 5, ly + 3, { align: 'right' })
    }
  })

  const payX = summaryX + summaryW + M
  const payW = PW - M - payX

  const payLines: { label: string; value: string; color?: string }[] = [
    { label: 'Montant paye', value: fmt(sale.paid) },
    { label: 'Montant restant', value: fmt(sale.total - sale.paid), color: RED },
    { label: 'Statut', value: getPaymentStatusLabel(sale) },
    { label: 'Mode', value: formatPaymentMethodLabel(sale.paymentMethod) },
  ]

  const payH = payLines.length * lh + 10

  rect(doc, payX, summaryStart - 2, payW, payH, LIGHT_GRAY, 4)

  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...hexToRgb(BLUE))
  doc.text('PAIEMENT', payX + 4, summaryStart + 2)

  payLines.forEach((line, i) => {
    const ly = summaryStart + (i + 1) * lh + 2
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    const pc = line.color ? hexToRgb(line.color) : [60, 60, 60] as const
    doc.setTextColor(pc[0], pc[1], pc[2])
    doc.text(line.label, payX + 4, ly + 2)
    doc.setFont('helvetica', 'bold')
    doc.text(line.value, payX + payW - 4, ly + 2, { align: 'right' })
  })

  let nextY = summaryStart + tH + 6

  if (sale.paymentMethod === 'credit' && sale.paid < sale.total) {
    const remaining = sale.total - sale.paid
    rect(doc, M, nextY, PW - M * 2, 10, RED, 3)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`RESTANT: ${fmt(remaining)}`, PW / 2, nextY + 7, { align: 'center' })
    nextY += 14
  }

  if (s.invoiceNotes) {
    rect(doc, M, nextY, PW - M * 2, 18, LIGHT_GRAY, 3)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...hexToRgb(BLUE))
    doc.text('Notes', M + 4, nextY + 6)
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(s.invoiceNotes, M + 4, nextY + 13)
    nextY += 22
  }

  if (s.accountNumber) {
    rect(doc, M, nextY, PW - M * 2, 8, LIGHT_GRAY, 3)
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(`Compte: ${s.bankName ? s.bankName + ' - ' : ''}${s.accountNumber}`, M + 4, nextY + 6)
    nextY += 12
  }

  const footY = PH - 12

  if (nextY > footY - 4) {
    doc.addPage()
    nextY = M + 4
  }

  const footStart = Math.max(nextY + 4, footY)

  rect(doc, 0, footStart, PW, 12, BLUE)

  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)

  let fx = M
  if (s.logo) {
    try { doc.addImage(s.logo, 'JPEG', fx, footStart + 1, 6, 6); fx += 10 } catch {}
  }
  const fparts = [s.name, s.address, s.phone ? `Tel: ${s.phone}` : '', s.email, s.website].filter(Boolean)
  doc.text(fparts.join(' | '), fx, footStart + 5)

  const now = new Date()
  const ds = now.toLocaleDateString('fr-FR')
  const ts = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  doc.setFontSize(5)
  doc.text(`Imprime le ${ds} a ${ts}`, PW - M, footStart + 5, { align: 'right' })
  doc.text(`Par: ${s.managerName || 'App'}`, PW - M, footStart + 9.5, { align: 'right' })

  doc.save(`facture_${sale.invoiceNumber || 'vente'}.pdf`)
}

export function shareSalePDF(sale: Sale, settings?: CompanySettings) {
  const doc = new jsPDF({ format: 'a5' })
  const s = settings || {} as CompanySettings
  drawBanner(doc, s)
  drawInvoiceBadge(doc, sale, 8)
  let yPos = 50
  yPos = drawInfoCards(doc, sale, s, yPos) + 2
  const rows = sale.items.map(item => [
    item.productName,
    item.quantity.toLocaleString('fr-FR'),
    item.unitName || 'p',
    fmt(item.unitPrice),
    item.discount > 0 ? fmt(item.discount) : '-',
    fmt(item.total),
  ])
  const colW = (PW - M * 2) / 6
  autoTable(doc, {
    startY: yPos,
    head: [['Designation', 'Qte', 'Unite', 'P/U', 'Remise', 'Montant']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: hexToRgb(BLUE), textColor: 255, fontSize: 6.5, fontStyle: 'bold', halign: 'center' as any },
    bodyStyles: { fontSize: 6 },
    columnStyles: {
      0: { cellWidth: 'auto' as any },
      1: { halign: 'center' as any, cellWidth: 12 },
      2: { halign: 'center' as any, cellWidth: 12 },
      3: { halign: 'right' as any, cellWidth: colW - 2 },
      4: { halign: 'center' as any, cellWidth: 18 },
      5: { halign: 'right' as any, cellWidth: colW },
    },
    margin: { left: M, right: M },
    tableLineColor: hexToRgb(LIGHT_GRAY),
    tableLineWidth: 0.3,
    styles: { cellPadding: 1.5 },
  })
  const finalY = (doc as any).lastAutoTable.finalY + 4
  const subtotal = sale.subtotal || sale.items.reduce((s, i) => s + i.total, 0)
  const discountTotal = sale.discountTotal || sale.items.reduce((s, i) => s + i.discount, 0)
  const taxTotal = sale.taxTotal || 0
  const total = sale.total
  const summaryX = M
  const summaryW = PW / 2 - M * 1.5
  const summaryStart = finalY
  const lh = 5
  const summaryLines: { label: string; value: string; bold?: boolean; color?: string }[] = [
    { label: 'Sous-total HT', value: fmt(subtotal) },
    { label: 'Remise totale', value: `- ${fmt(discountTotal)}`, color: RED },
  ]
  if (taxTotal > 0) summaryLines.push({ label: 'Taxe', value: fmt(taxTotal) })
  summaryLines.push({ label: '', value: '' })
  summaryLines.push({ label: 'TOTAL TTC', value: fmt(total), bold: true })
  const tH = summaryLines.length * lh + 10
  rect(doc, summaryX, summaryStart - 2, summaryW, tH, LIGHT_GRAY, 4)
  summaryLines.forEach((line, i) => {
    const ly = summaryStart + i * lh + 2
    if (line.bold) {
      rect(doc, summaryX, ly - 1, summaryW, lh + 3, BLUE, 3)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(line.label, summaryX + 5, ly + 4)
      doc.text(line.value, summaryX + summaryW - 5, ly + 4, { align: 'right' })
    } else if (line.label) {
      doc.setFontSize(6)
      doc.setFont('helvetica', 'normal')
      const lc = line.color ? hexToRgb(line.color) : [60, 60, 60] as const
      doc.setTextColor(lc[0], lc[1], lc[2])
      doc.text(line.label, summaryX + 5, ly + 3)
      doc.text(line.value, summaryX + summaryW - 5, ly + 3, { align: 'right' })
    }
  })
  const payX = summaryX + summaryW + M
  const payW = PW - M - payX
  const payLines: { label: string; value: string; color?: string }[] = [
    { label: 'Montant paye', value: fmt(sale.paid) },
    { label: 'Montant restant', value: fmt(sale.total - sale.paid), color: RED },
    { label: 'Statut', value: getPaymentStatusLabel(sale) },
    { label: 'Mode', value: formatPaymentMethodLabel(sale.paymentMethod) },
  ]
  const payH = payLines.length * lh + 10
  rect(doc, payX, summaryStart - 2, payW, payH, LIGHT_GRAY, 4)
  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...hexToRgb(BLUE))
  doc.text('PAIEMENT', payX + 4, summaryStart + 2)
  payLines.forEach((line, i) => {
    const ly = summaryStart + (i + 1) * lh + 2
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    const pc = line.color ? hexToRgb(line.color) : [60, 60, 60] as const
    doc.setTextColor(pc[0], pc[1], pc[2])
    doc.text(line.label, payX + 4, ly + 2)
    doc.setFont('helvetica', 'bold')
    doc.text(line.value, payX + payW - 4, ly + 2, { align: 'right' })
  })
  let nextY = summaryStart + tH + 6
  if (sale.paymentMethod === 'credit' && sale.paid < sale.total) {
    const remaining = sale.total - sale.paid
    rect(doc, M, nextY, PW - M * 2, 10, RED, 3)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`RESTANT: ${fmt(remaining)}`, PW / 2, nextY + 7, { align: 'center' })
    nextY += 14
  }
  if (s.invoiceNotes) {
    rect(doc, M, nextY, PW - M * 2, 18, LIGHT_GRAY, 3)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...hexToRgb(BLUE))
    doc.text('Notes', M + 4, nextY + 6)
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(s.invoiceNotes, M + 4, nextY + 13)
    nextY += 22
  }
  if (s.accountNumber) {
    rect(doc, M, nextY, PW - M * 2, 8, LIGHT_GRAY, 3)
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(`Compte: ${s.bankName ? s.bankName + ' - ' : ''}${s.accountNumber}`, M + 4, nextY + 6)
    nextY += 12
  }
  const footY = PH - 12
  if (nextY > footY - 4) { doc.addPage(); nextY = M + 4 }
  const footStart = Math.max(nextY + 4, footY)
  rect(doc, 0, footStart, PW, 12, BLUE)
  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  let fx = M
  if (s.logo) { try { doc.addImage(s.logo, 'JPEG', fx, footStart + 1, 6, 6); fx += 10 } catch {} }
  const fparts = [s.name, s.address, s.phone ? `Tel: ${s.phone}` : '', s.email, s.website].filter(Boolean)
  doc.text(fparts.join(' | '), fx, footStart + 5)
  const now = new Date()
  const ds = now.toLocaleDateString('fr-FR')
  const ts = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  doc.setFontSize(5)
  doc.text(`Imprime le ${ds} a ${ts}`, PW - M, footStart + 5, { align: 'right' })
  doc.text(`Par: ${s.managerName || 'App'}`, PW - M, footStart + 9.5, { align: 'right' })
  const blob = doc.output('blob')
  const file = new File([blob], `facture_${sale.invoiceNumber || 'vente'}.pdf`, { type: 'application/pdf' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: `Facture ${sale.invoiceNumber}` }).catch(() => doc.save(`facture_${sale.invoiceNumber || 'vente'}.pdf`))
  } else {
    doc.save(`facture_${sale.invoiceNumber || 'vente'}.pdf`)
  }
}

export function exportInvoicePDF(invoice: Invoice, settings?: CompanySettings) {
  const paid = invoice.status === 'paid' ? invoice.total : invoice.paid
  const sale: Sale = {
    id: invoice.id,
    businessId: '',
    locationId: '',
    invoiceNumber: invoice.number,
    customerId: invoice.partyId,
    customerName: invoice.partyName,
    items: invoice.items.map(i => ({
      productId: '',
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount || 0,
      taxRate: i.taxRate || 0,
      total: i.total,
    })),
    subtotal: invoice.subtotal,
    discountTotal: 0,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    paid: invoice.paid,
    change: 0,
    paymentMethod: 'cash',
    status: invoice.status === 'paid' ? 'completed' : invoice.status === 'cancelled' ? 'cancelled' : 'pending',
    createdAt: invoice.createdAt,
    userId: invoice.userId,
  }
  exportSalePDF(sale, settings)
}

export function exportBonSortiePDF(
  bonNumber: string,
  fromName: string,
  toName: string,
  items: TransferItem[],
  userName: string,
  date: string,
  settings?: CompanySettings
) {
  const doc = new jsPDF({ format: 'a5' })
  const s = settings || {} as CompanySettings

  drawBanner(doc, s)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...hexToRgb(BLUE))
  doc.text(`Bon de Sortie n°${bonNumber}`, PW / 2, 50, { align: 'center' })

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`Origine: ${fromName}`, M, 58)
  doc.text(`Destination: ${toName}`, M, 64)
  doc.text(`Date: ${new Date(date).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`, M, 70)
  doc.text(`Utilisateur: ${userName}`, M, 76)

  const rows = items.map(item => [
    item.productName,
    String(item.quantity),
  ])

  autoTable(doc, {
    startY: 82,
    head: [['Produit', 'Quantité']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: hexToRgb(BLUE), textColor: 255, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    columnStyles: { 0: { cellWidth: PW - M * 2 - 20 }, 1: { halign: 'center', cellWidth: 20 } },
    margin: { left: M, right: M },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 6

  doc.setFontSize(6.5)
  doc.setTextColor(GRAY)
  doc.text('Signature expediteur: ___________________________', M, finalY + 8)
  doc.text('Signature destinataire: ________________________', M, finalY + 14)

  const footStart = PH - 12
  rect(doc, 0, footStart, PW, 12, BLUE)
  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR')
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  doc.text(`Genere par ${s.name || 'App'} le ${dateStr} a ${timeStr}`, M, footStart + 5)
  doc.text(`User: ${userName}`, PW - M, footStart + 5, { align: 'right' })

  doc.save(`bon_sortie_${bonNumber}.pdf`)
}

export function exportReportPDF(title: string, headers: string[], data: string[][], filename: string) {
  const doc = new jsPDF('landscape')

  rect(doc, 0, 0, 297, 30, BLUE)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 20)

  autoTable(doc, {
    startY: 36,
    head: [headers],
    body: data,
    theme: 'grid',
    headStyles: { fillColor: hexToRgb(BLUE), textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    margin: { top: 36, left: 14, right: 14 },
    tableLineColor: hexToRgb(LIGHT_GRAY),
    tableLineWidth: 0.5,
  })

  const pageH = 210
  rect(doc, 0, pageH - 14, 297, 14, BLUE)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR')
  doc.text(`Généré le ${dateStr}`, 14, pageH - 4)

  doc.save(`${filename}.pdf`)
}

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'EN ATTENTE',
  valide: 'VALIDÉ',
  recu: 'REÇU',
  annule: 'ANNULÉ',
}

function esc(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildBonSortieHTML(bon: BonSortie, settings?: CompanySettings, format: 'a4' | 'a5' | 'thermal' = 'a4'): string {
  const widths = { a4: 210, a5: 148, thermal: 80 }
  const w = widths[format]
  const compact = format === 'thermal'
  const fs = compact ? 10 : 12
  const small = compact ? 8 : 10

  const rows = bon.items.map(item => `
    <tr>
      <td>${esc(item.reference)}</td>
      <td>${esc(item.barcode)}</td>
      <td>${esc(item.productName)}</td>
      <td>${esc(item.variant)}</td>
      <td class="r">${item.quantity}</td>
      <td>${esc(item.unit)}</td>
      <td class="r">${item.unitPrice ? fmt(item.unitPrice) : '—'}</td>
      <td class="r">${item.total ? fmt(item.total) : '—'}</td>
    </tr>`).join('')

  const recep = bon.receivedAt
    ? `<p><strong>Date de réception :</strong> ${new Date(bon.receivedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })} — ${bon.receivedTime || ''}</p>
       <p><strong>Reçu par :</strong> ${esc(bon.receivedBy) || '—'}</p>`
    : `<p class="muted">Réception non confirmée</p>`

  const val = bon.validatedAt
    ? `<p><strong>Validé le :</strong> ${new Date(bon.validatedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })} par ${esc(bon.validatedByName) || '—'}</p>`
    : ''

  const sigs = bon.signatures || {}

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bon de sortie ${bon.number}</title>
<style>
  @page { size: ${w}mm auto; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: ${fs}px; color: #111; margin: 0; }
  .banner { display: flex; justify-content: space-between; align-items: center; background: #1e40af; color: #fff; padding: 10px 12px; border-radius: 4px; }
  .banner .left { display: flex; align-items: center; gap: 10px; }
  .banner img { height: 40px; width: 40px; object-fit: contain; }
  .banner h1 { margin: 0; font-size: ${compact ? 13 : 18}px; }
  .banner h2 { margin: 0; font-size: ${compact ? 11 : 16}px; font-weight: normal; }
  .banner .num { text-align: right; font-size: ${compact ? 9 : 12}px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .box { border: 1px solid #dbe3f0; border-radius: 4px; padding: 8px 10px; }
  .box h3 { margin: 0 0 4px; font-size: ${small}px; text-transform: uppercase; color: #1e40af; }
  .box p { margin: 2px 0; }
  .meta { margin-top: 10px; font-size: ${small}px; }
  .meta p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: ${compact ? 8 : 10}px; }
  th { background: #1e40af; color: #fff; text-align: left; padding: 5px 6px; font-size: ${compact ? 7 : 9}px; text-transform: uppercase; }
  td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; }
  .r { text-align: right; }
  .totals { display: flex; justify-content: flex-end; gap: 20px; margin-top: 8px; font-weight: bold; font-size: ${small}px; }
  .sign { display: flex; justify-content: space-between; gap: 20px; margin-top: 28px; }
  .sign .col { flex: 1; }
  .sign .line { margin-top: 34px; border-top: 1px dashed #94a3b8; font-size: ${small}px; color: #475569; }
  .sign .who { font-size: ${small}px; color: #1e40af; font-weight: bold; min-height: 14px; }
  .footer { margin-top: 18px; padding-top: 6px; border-top: 2px solid #1e40af; font-size: ${compact ? 7 : 9}px; color: #64748b; text-align: center; }
  .muted { color: #94a3b8; }
</style></head><body>
  <div class="banner">
    <div class="left">
      ${settings?.logo ? `<img src="${esc(settings.logo)}" alt="logo" />` : ''}
      <div>
        <h1>${esc(settings?.name || 'Entreprise')}</h1>
        ${settings?.slogan ? `<h2>${esc(settings.slogan)}</h2>` : ''}
        ${settings?.address ? `<h2>${esc(settings.address)}</h2>` : ''}
        ${settings?.phone ? `<h2>Tel: ${esc(settings.phone)}</h2>` : ''}
        ${settings?.email ? `<h2>${esc(settings.email)}</h2>` : ''}
      </div>
    </div>
    <div class="num">
      <div style="font-weight:bold;font-size:${compact ? 11 : 16}px;">BON DE SORTIE</div>
      <div>N° ${esc(bon.number)}</div>
      <div style="color:#fde047;font-weight:bold;">${STATUS_LABELS[bon.status] || bon.status}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>Provenance</h3>
      <p><strong>${esc(bon.fromLocationName)}</strong> ${bon.fromLocationCode ? `(${esc(bon.fromLocationCode)})` : ''}</p>
      ${bon.fromAddress ? `<p>${esc(bon.fromAddress)}</p>` : '<p class="muted">Adresse non renseignée</p>'}
    </div>
    <div class="box">
      <h3>Destination</h3>
      <p><strong>${esc(bon.toLocationName)}</strong> ${bon.toLocationCode ? `(${esc(bon.toLocationCode)})` : ''}</p>
      ${bon.toAddress ? `<p>${esc(bon.toAddress)}</p>` : '<p class="muted">Adresse non renseignée</p>'}
    </div>
  </div>

  <div class="meta">
    <p><strong>Date de création :</strong> ${new Date(bon.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })} — ${esc(bon.createdTime)} &nbsp;&nbsp; <strong>Date d'expédition :</strong> ${bon.shippedAt ? new Date(bon.shippedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—'} ${bon.shippedTime ? '— ' + esc(bon.shippedTime) : ''}</p>
    <p><strong>Destinateur :</strong> ${esc(bon.destinateurName)} ${bon.destinateurRole ? `(${esc(bon.destinateurRole)})` : ''} &nbsp;&nbsp; <strong>Destinataire :</strong> ${esc(bon.destinataireName) || '—'} ${bon.destinataireRole ? `(${esc(bon.destinataireRole)})` : ''}</p>
    <p><strong>Référence :</strong> ${esc(bon.reference) || '—'} &nbsp;&nbsp; <strong>Motif :</strong> ${esc(bon.motif) || '—'}</p>
    ${bon.comments ? `<p><strong>Observations :</strong> ${esc(bon.comments)}</p>` : ''}
    ${val}
  </div>

  <table>
    <thead><tr><th>Réf.</th><th>Code-barres</th><th>Produit</th><th>Variante</th><th>Qté</th><th>Unité</th><th>P.U.</th><th>Valeur</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <span>Articles : ${bon.totalArticles}</span>
    <span>Quantité totale : ${bon.totalQuantity}</span>
    ${bon.totalValue ? `<span>Valeur totale : ${fmt(bon.totalValue)}</span>` : ''}
  </div>

  <div class="meta">
    ${recep}
  </div>

  <div class="sign">
    <div class="col">
      <div class="who">${esc(sigs.destinateur || bon.destinateurName || 'Expéditeur')}</div>
      <div class="line">Signature du destinateur</div>
    </div>
    <div class="col">
      <div class="who">${esc(sigs.destinataire || bon.receivedBy || '')}</div>
      <div class="line">Signature du destinataire</div>
    </div>
    <div class="col">
      <div class="who">${esc(sigs.responsable || '')}</div>
      <div class="line">Signature du responsable</div>
    </div>
  </div>

  <div class="footer">
    Document généré par ${esc(settings?.name || 'NeoX ERP')} le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — N° ${esc(bon.number)}
  </div>
</body></html>`
}

export function printBonSortieDocument(bon: BonSortie, settings?: CompanySettings, format: 'a4' | 'a5' | 'thermal' = 'a4') {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(buildBonSortieHTML(bon, settings, format))
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* fenêtre fermée */ } }, 500)
}

export function downloadBonSortiePDF(bon: BonSortie, settings?: CompanySettings, format: 'a4' | 'a5' = 'a4') {
  const isA5 = format === 'a5'
  const doc = new jsPDF({ unit: 'mm', format: isA5 ? 'a5' : 'a4' })
  const W = isA5 ? 148 : 210
  const H = isA5 ? 210 : 297
  const M = 10
  const s = settings || {} as CompanySettings

  rect(doc, 0, 0, W, 34, BLUE)
  let lx = M
  if (s.logo) { try { doc.addImage(s.logo, 'JPEG', M, 5, 18, 18) } catch { try { doc.addImage(s.logo, 'PNG', M, 5, 18, 18) } catch {} } lx = M + (s.logo ? 24 : 0) }
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text(s.name || 'Entreprise', lx, 12)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal')
  let ly = 18
  if (s.slogan) { doc.text(s.slogan, lx, ly); ly += 4 }
  if (s.address) { doc.text(s.address, lx, ly); ly += 4 }
  if (s.phone) { doc.text(`Tel: ${s.phone}`, lx, ly); ly += 4 }
  if (s.email) { doc.text(s.email, lx, ly); ly += 4 }
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('BON DE SORTIE', W - M, 14, { align: 'right' })
  doc.setFontSize(9)
  doc.text(`N° ${bon.number}`, W - M, 22, { align: 'right' })
  doc.setFontSize(8)
  doc.text(STATUS_LABELS[bon.status] || bon.status, W - M, 28, { align: 'right' })

  let y = 40
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...hexToRgb(BLUE))
  doc.text('PROVENANCE', M, y)
  doc.setDrawColor(...hexToRgb(LIGHT_GRAY)); doc.setLineWidth(0.3)
  doc.roundedRect(M, y + 1, W / 2 - M - 3, 18, 1.5, 1.5, 'S')
  doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(bon.fromLocationName || bon.fromLocationId, M + 2, y + 7)
  doc.setFontSize(6.5); doc.setTextColor(100, 100, 100)
  doc.text(bon.fromAddress || 'Adresse non renseignée', M + 2, y + 12)
  doc.text(bon.fromLocationCode ? `Code: ${bon.fromLocationCode}` : '', M + 2, y + 16)

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...hexToRgb(BLUE))
  doc.text('DESTINATION', W / 2 + 2, y)
  doc.roundedRect(W / 2 + 2, y + 1, W / 2 - M - 3, 18, 1.5, 1.5, 'S')
  doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(bon.toLocationName || bon.toLocationId, W / 2 + 4, y + 7)
  doc.setFontSize(6.5); doc.setTextColor(100, 100, 100)
  doc.text(bon.toAddress || 'Adresse non renseignée', W / 2 + 4, y + 12)
  doc.text(bon.toLocationCode ? `Code: ${bon.toLocationCode}` : '', W / 2 + 4, y + 16)

  y += 26
  doc.setFontSize(6.5); doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal')
  const meta = [
    `Date de création : ${new Date(bon.createdAt).toLocaleDateString('fr-FR')}  ${bon.createdTime || ''}`,
    `Date d'expédition : ${bon.shippedAt ? new Date(bon.shippedAt).toLocaleDateString('fr-FR') : '—'} ${bon.shippedTime ? ' ' + bon.shippedTime : ''}`,
    `Destinateur : ${bon.destinateurName}${bon.destinateurRole ? ' (' + bon.destinateurRole + ')' : ''}`,
    `Destinataire : ${bon.destinataireName || '—'}${bon.destinataireRole ? ' (' + bon.destinataireRole + ')' : ''}`,
    `Référence : ${bon.reference || '—'}    Motif : ${bon.motif || '—'}`,
    bon.comments ? `Observations : ${bon.comments}` : '',
  ]
  for (const line of meta) { if (line) { doc.text(line, M, y); y += 4 } }

  y += 3
  const head = ['Réf.', 'Code-barres', 'Produit', 'Variante', 'Qté', 'Unité', 'P.U.', 'Valeur']
  const body = bon.items.map(it => [
    it.reference || '',
    it.barcode || '',
    it.productName,
    it.variant || '',
    String(it.quantity),
    it.unit || '',
    it.unitPrice ? fmt(it.unitPrice) : '—',
    it.total ? fmt(it.total) : '—',
  ])
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    headStyles: { fillColor: hexToRgb(BLUE), textColor: 255, fontSize: 6, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6 },
    margin: { left: M, right: M },
    columnStyles: { 4: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  })

  let fy = (doc as any).lastAutoTable.finalY + 5
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
  doc.text(`Nombre d'articles : ${bon.totalArticles}`, M, fy)
  doc.text(`Quantité totale : ${bon.totalQuantity}`, M + 60, fy)
  if (bon.totalValue) doc.text(`Valeur totale : ${fmt(bon.totalValue)}`, W - M, fy, { align: 'right' })

  fy += 7
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
  if (bon.receivedAt) {
    doc.text(`Réception confirmée le ${new Date(bon.receivedAt).toLocaleDateString('fr-FR')} à ${bon.receivedTime || ''} par ${bon.receivedBy || '—'}`, M, fy)
  } else {
    doc.text('Réception non confirmée', M, fy)
  }
  if (bon.validatedAt) {
    fy += 4
    doc.text(`Validé le ${new Date(bon.validatedAt).toLocaleDateString('fr-FR')} par ${bon.validatedByName || '—'}`, M, fy)
  }

  fy += 10
  const sigTop = fy
  doc.setFontSize(6.5)
  doc.text((bon.signatures?.destinateur || bon.destinateurName || ''), M, sigTop + 2)
  doc.text((bon.signatures?.destinataire || bon.receivedBy || ''), W / 2, sigTop + 2)
  doc.text((bon.signatures?.responsable || ''), W - M, sigTop + 2, { align: 'right' })
  doc.setDrawColor(...hexToRgb(BLUE)); doc.setLineDashPattern([1, 1], 0); doc.setLineWidth(0.2)
  doc.line(M, sigTop + 6, M + 55, sigTop + 6)
  doc.line(W / 2, sigTop + 6, W / 2 + 55, sigTop + 6)
  doc.line(W - M - 55, sigTop + 6, W - M, sigTop + 6)
  doc.setLineDashPattern([], 0)
  doc.setTextColor(120, 120, 120); doc.setFontSize(6)
  doc.text('Signature du destinateur', M, sigTop + 10)
  doc.text('Signature du destinataire', W / 2, sigTop + 10)
  doc.text('Signature du responsable', W - M, sigTop + 10, { align: 'right' })

  const foot = H - 12
  rect(doc, 0, foot, W, 12, BLUE)
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 255, 255)
  const now = new Date()
  doc.text(`Document généré par ${s.name || 'NeoX ERP'} le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, M, foot + 5)
  doc.text(`N° ${bon.number}`, W - M, foot + 5, { align: 'right' })

  doc.save(`bon_sortie_${bon.number}.pdf`)
}