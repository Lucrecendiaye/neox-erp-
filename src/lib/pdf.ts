import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, Sale } from '@/types'
import type { Transfer, TransferItem } from '@/engine/types'
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