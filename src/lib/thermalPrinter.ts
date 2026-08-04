const ESC = 0x1B
const GS = 0x1D

interface USBEndpoint {
  endpointNumber: number
  direction: 'in' | 'out'
  type: 'bulk' | 'interrupt' | 'isochronous'
  packetSize: number
}

interface USBInterface {
  alternate: {
    endpoints: USBEndpoint[]
  }
}

interface USBConfiguration {
  interfaces: USBInterface[]
}

interface USBDevice {
  open: () => Promise<void>
  selectConfiguration: (index: number) => Promise<void>
  claimInterface: (index: number) => Promise<void>
  transferOut: (endpoint: number, data: BufferSource) => Promise<USBOutTransferResult>
  close: () => Promise<void>
  configuration: USBConfiguration
}

interface USBOutTransferResult {
  bytesWritten: number
  status: 'ok' | 'stall'
}

interface Navigator {
  usb?: {
    requestDevice: (options: { filters: { vendorId: number }[] }) => Promise<USBDevice>
  }
}

export class ThermalPrinter {
  private device: USBDevice | null = null
  private endpoint: number | null = null

  async connect(): Promise<boolean> {
    if (!(navigator as any).usb) {
      throw new Error('WebUSB non supporté par ce navigateur')
    }
    const device = await (navigator as any).usb.requestDevice({
      filters: [
        { vendorId: 0x0fe6 },
        { vendorId: 0x0416 },
        { vendorId: 0x10c4 },
        { vendorId: 0x0483 },
      ]
    }) as USBDevice
    await device.open()
    await device.selectConfiguration(1)
    await device.claimInterface(0)

    const ep = device.configuration.interfaces[0].alternate.endpoints.find(
      (e: USBEndpoint) => e.direction === 'out'
    )
    if (!ep) throw new Error('Aucun endpoint de sortie trouvé')

    this.device = device
    this.endpoint = ep.endpointNumber
    return true
  }

  private async write(data: Uint8Array): Promise<void> {
    if (!this.device || !this.endpoint) throw new Error('Imprimante non connectée')
    await this.device.transferOut(this.endpoint, data.buffer as ArrayBuffer)
  }

  async print(text: string, options?: {
    bold?: boolean
    doubleWidth?: boolean
    doubleHeight?: boolean
    align?: 'left' | 'center' | 'right'
    fontSize?: number
  }): Promise<void> {
    const cmds: number[] = []

    cmds.push(ESC, 0x40)

    if (options?.align) {
      const alignMap = { left: 0x00, center: 0x01, right: 0x02 }
      cmds.push(ESC, 0x61, alignMap[options.align])
    }

    if (options?.fontSize) {
      const size = Math.min(Math.max(options.fontSize, 1), 8)
      cmds.push(GS, 0x21, (size - 1) | ((size - 1) << 4))
    }

    if (options?.bold) {
      cmds.push(ESC, 0x45, 0x01)
    }

    if (options?.doubleWidth || options?.doubleHeight) {
      const w = options?.doubleWidth ? 1 : 0
      const h = options?.doubleHeight ? 1 : 0
      cmds.push(GS, 0x21, (w << 4) | h)
    }

    const encoder = new TextEncoder()
    const textBytes = Array.from(encoder.encode(text))
    cmds.push(...textBytes)
    cmds.push(0x0A)

    await this.write(new Uint8Array(cmds))
  }

  async printLine(text: string): Promise<void> {
    await this.print(text + '\n')
  }

  async printReceipt(lines: { text: string; bold?: boolean; doubleWidth?: boolean; align?: 'left' | 'center' | 'right' }[]): Promise<void> {
    for (const line of lines) {
      if (line.text === '---') {
        await this.write(new Uint8Array([0x1B, 0x45, 0x00]))
        const dashes = '='.repeat(32) + '\n'
        await this.write(new Uint8Array(Array.from(new TextEncoder().encode(dashes))))
        continue
      }
      if (line.text === '') {
        await this.write(new Uint8Array([0x0A]))
        continue
      }
      await this.print(line.text, {
        bold: line.bold,
        doubleWidth: line.doubleWidth,
        align: line.align || 'left',
      })
    }
  }

  async cut(): Promise<void> {
    await this.write(new Uint8Array([GS, 0x56, 0x00]))
  }

  async openDrawer(): Promise<void> {
    await this.write(new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xFA]))
  }

  async beep(): Promise<void> {
    await this.write(new Uint8Array([ESC, 0x42, 0x03, 0x03]))
  }

  disconnect(): void {
    this.device?.close()
    this.device = null
    this.endpoint = null
  }

  isConnected(): boolean {
    return this.device !== null && this.endpoint !== null
  }
}

export const thermalPrinter = new ThermalPrinter()

export function printReceiptHTML(sale: { invoiceNumber: string; customerName?: string; items: { productName: string; quantity: number; unitName?: string; unitPrice: number; total: number }[]; total: number; paid: number; change?: number; createdAt: string; paymentMethod: string }, businessName?: string) {
  const w = window.open('', '', 'width=400,height=600')
  if (!w) return
  const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' FCFA'
  const date = new Date(sale.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const payLabels: Record<string, string> = { cash: 'Espèces', mobile: 'Mobile Money', card: 'Carte', bank: 'Banque' }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${sale.invoiceNumber}</title><style>
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
    h2 { text-align: center; font-size: 16px; margin: 5px 0; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; }
    .right { text-align: right; }
    .total { font-weight: bold; font-size: 14px; }
    .footer { text-align: center; margin-top: 10px; font-size: 11px; }
  </style></head><body>
    <h2>${businessName || 'NEOX ERP'}</h2>
    <p class="center">Facture ${sale.invoiceNumber}</p>
    <p class="center">${date}</p>
    ${sale.customerName ? `<p>Client: ${sale.customerName}</p>` : ''}
    <div class="line"></div>
    <table>
      <tr><th>Article</th><th class="right">Qté</th><th class="right">PU</th><th class="right">Total</th></tr>
      ${sale.items.map(i => `<tr><td>${i.productName}</td><td class="right">${i.quantity}${i.unitName ? ' ' + i.unitName : ''}</td><td class="right">${fmt(i.unitPrice)}</td><td class="right">${fmt(i.total)}</td></tr>`).join('')}
    </table>
    <div class="line"></div>
    <table>
      <tr><td><strong>Total</strong></td><td class="right"><strong>${fmt(sale.total)}</strong></td></tr>
      <tr><td>Payé</td><td class="right">${fmt(sale.paid)}</td></tr>
      ${sale.change ? `<tr><td>Monnaie</td><td class="right">${fmt(sale.change)}</td></tr>` : ''}
    </table>
    <p class="center">Paiement: ${payLabels[sale.paymentMethod] || sale.paymentMethod}</p>
    <div class="line"></div>
    <p class="footer">Merci de votre visite !</p>
    <script>window.onload = function() { window.print(); window.close(); }<\\/script>
  </body></html>`)
  w.document.close()
}
