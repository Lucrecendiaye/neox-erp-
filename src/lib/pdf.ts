import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from './utils'
import type { Invoice, Sale, Purchase, Product } from '@/types'

const primary = '#4f46e5'
const gray = '#64748b'

function addHeader(doc: jsPDF, title: string, companyName?: string) {
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(companyName || 'NeoX ERP', 14, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(title, 14, 28)
  doc.setTextColor(primary)
  doc.setDrawColor(primary)
  doc.setLineWidth(0.5)
  doc.line(14, 34, 196, 34)
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(gray)
    doc.text(`Généré par NeoX ERP · Page ${i} sur ${pageCount}`, 14, 285, { align: 'left' })
    doc.text(new Date().toLocaleDateString('fr-FR'), 196, 285, { align: 'right' })
  }
}

export function exportInvoicePDF(invoice: Invoice, companyName?: string, logo?: string) {
  const doc = new jsPDF()
  addHeader(doc, `Facture ${invoice.number}`, companyName)

  doc.setFontSize(9)
  doc.setTextColor(gray)
  doc.text('Client', 14, 48)
  doc.setFontSize(10)
  doc.setTextColor('#0f172a')
  doc.setFont('helvetica', 'bold')
  doc.text(invoice.partyName || 'N/A', 14, 54)

  doc.setFontSize(9)
  doc.setTextColor(gray)
  doc.setFont('helvetica', 'normal')
  doc.text('Date', 120, 48)
  doc.setFontSize(10)
  doc.setTextColor('#0f172a')
  doc.text(new Date(invoice.createdAt).toLocaleDateString('fr-FR'), 120, 54)

  doc.setFontSize(9)
  doc.setTextColor(gray)
  doc.text('Échéance', 155, 48)
  doc.setFontSize(10)
  doc.setTextColor('#0f172a')
  doc.text(invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : '-', 155, 54)

  const rows = invoice.items.map(item => [
    item.productName,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    `${item.taxRate}%`,
    formatCurrency(item.unitPrice * item.quantity),
  ])

  autoTable(doc, {
    startY: 62,
    head: [['Article', 'Qté', 'Prix unit.', 'TVA', 'Total']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 70 }, 4: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'center' }, 1: { halign: 'center' } },
    foot: [[
      { content: 'Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } },
      { content: formatCurrency(invoice.total), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10, textColor: [79, 70, 229] } },
    ]],
    margin: { top: 60 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10

  if (invoice.status === 'paid') {
    doc.setFontSize(12)
    doc.setTextColor('#10b981')
    doc.setFont('helvetica', 'bold')
    doc.text('✓ PAYÉE', 170, finalY, { align: 'right' })
  }

  addFooter(doc)
  doc.save(`facture_${invoice.number}.pdf`)
}

export function exportSalePDF(sale: Sale, companyName?: string) {
  const doc = new jsPDF()
  addHeader(doc, `Reçu ${sale.invoiceNumber}`, companyName)

  doc.setFontSize(9)
  doc.setTextColor(gray)
  doc.text('Client', 14, 48)
  doc.setFontSize(10)
  doc.setTextColor('#0f172a')
  doc.setFont('helvetica', 'bold')
  doc.text(sale.customerName || 'Client divers', 14, 54)

  doc.setFontSize(9)
  doc.setTextColor(gray)
  doc.setFont('helvetica', 'normal')
  doc.text('Date', 140, 48)
  doc.setFontSize(10)
  doc.setTextColor('#0f172a')
  doc.text(new Date(sale.createdAt).toLocaleDateString('fr-FR'), 140, 54)
  doc.text(new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 140, 60)

  doc.setFontSize(9)
  doc.setTextColor(gray)
  doc.text('Paiement', 14, 64)
  doc.setFontSize(10)
  doc.setTextColor('#0f172a')
  doc.text(sale.paymentMethod, 14, 70)

  const rows = sale.items.map(item => [
    item.productName,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(item.unitPrice * item.quantity),
  ])

  autoTable(doc, {
    startY: 78,
    head: [['Article', 'Qté', 'Prix unit.', 'Total']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 80 }, 3: { halign: 'right' }, 2: { halign: 'right' }, 1: { halign: 'center' } },
    foot: [[
      { content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } },
      { content: formatCurrency(sale.total), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10, textColor: [79, 70, 229] } },
    ]],
    margin: { top: 60 },
  })

  addFooter(doc)
  doc.save(`recu_${sale.invoiceNumber}.pdf`)
}

export function exportReportPDF(title: string, headers: string[], data: string[][], filename: string) {
  const doc = new jsPDF('landscape')
  addHeader(doc, title)

  autoTable(doc, {
    startY: 44,
    head: [headers],
    body: data,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    margin: { top: 44 },
  })

  addFooter(doc)
  doc.save(`${filename}.pdf`)
}
