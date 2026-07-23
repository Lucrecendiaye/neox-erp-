import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Modal, Badge } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, generateId } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processStockAdjustment, processTransfer } from '@/engine/operations'
import { Package, Search, ArrowLeft, ArrowRightLeft, Plus } from 'lucide-react'

export default function DepotStockPage() {
  const { locationId } = useParams()
  const navigate = useNavigate()
  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const stocks = useLiveQuery(() => db.productStocks.where('locationId').equals(locationId!).toArray(), [locationId])
  const allProducts = useLiveQuery(() => db.products.toArray(), [])
  const [search, setSearch] = useState('')
  const [adjModal, setAdjModal] = useState(false)
  const [adjProduct, setAdjProduct] = useState('')
  const [adjQty, setAdjQty] = useState(0)
  const [adjNote, setAdjNote] = useState('')
  const [transferModal, setTransferModal] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferItems, setTransferItems] = useState<{ productId: string; qty: number }[]>([])
  const locations = useLiveQuery(() => db.locations.toArray(), [])

  const productMap = useMemo(() => {
    const m = new Map(allProducts?.map(p => [p.id, p]))
    return m
  }, [allProducts])

  const filtered = stocks?.filter(s => {
    const p = productMap.get(s.productId)
    return p?.name.toLowerCase().includes(search.toLowerCase())
  }) || []

  async function handleAdjust() {
    if (!adjProduct || adjQty < 0) return toast('Champs invalides', 'warning')
    await processStockAdjustment(adjProduct, locationId!, adjQty, adjNote)
    toast('Stock ajusté', 'success')
    setAdjModal(false)
    setAdjProduct('')
    setAdjQty(0)
    setAdjNote('')
  }

  async function handleTransfer() {
    if (!transferTarget || transferItems.length === 0) return toast('Champs invalides', 'warning')
    await processTransfer({
      id: generateId(),
      businessId: 'biz-default',
      fromLocationId: locationId!,
      toLocationId: transferTarget,
      items: transferItems.map(i => ({
        productId: i.productId,
        productName: productMap.get(i.productId)?.name || '',
        quantity: i.qty,
      })),
      status: 'pending',
      createdAt: new Date().toISOString(),
      userId: 'admin',
    })
    toast('Transfert effectué', 'success')
    setTransferModal(false)
    setTransferTarget('')
    setTransferItems([])
  }

  const otherLocations = locations?.filter(l => l.id !== locationId) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{location?.name || 'Stock'}</h1>
          <p className="text-surface-500 text-sm">{location?.type === 'shop' ? 'Boutique' : 'Dépôt'}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-surface-300 text-sm" />
        </div>
        <Button onClick={() => setAdjModal(true)}><Plus className="w-4 h-4" /> Ajuster</Button>
        <Button onClick={() => setTransferModal(true)}><ArrowRightLeft className="w-4 h-4" /> Transférer</Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Produit</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Qté</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Prix d'achat</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Valeur</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-6 py-4">Alerte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map(s => {
                const p = productMap.get(s.productId)
                return (
                  <tr key={s.id} className="hover:bg-surface-50">
                    <td className="px-6 py-4 text-sm font-medium text-surface-900">{p?.name || s.productId}</td>
                    <td className="px-6 py-4 text-right text-sm font-semibold">{s.quantity}</td>
                    <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(p?.purchasePrice || 0)}</td>
                    <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(s.quantity * (p?.purchasePrice || 0))}</td>
                    <td className="px-6 py-4 text-center">
                      {s.quantity <= s.stockAlert && <Badge variant="danger">Stock bas</Badge>}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-surface-400">Aucun stock</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Ajustement de stock">
        <div className="space-y-4">
          <select value={adjProduct} onChange={e => setAdjProduct(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm">
            <option value="">Sélectionner un produit</option>
            {allProducts?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="Nouvelle quantité" value={adjQty} onChange={e => setAdjQty(Number(e.target.value))} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <input placeholder="Note (optionnel)" value={adjNote} onChange={e => setAdjNote(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <Button onClick={handleAdjust} className="w-full">Valider</Button>
        </div>
      </Modal>

      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="Transférer vers">
        <div className="space-y-4">
          <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm">
            <option value="">Destination</option>
            {otherLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {allProducts?.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-sm flex-1">{p.name}</span>
              <input type="number" min="0" placeholder="Qté" className="w-20 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-right"
                onChange={e => {
                  const qty = Number(e.target.value)
                  setTransferItems(prev => {
                    const existing = prev.find(i => i.productId === p.id)
                    if (existing) {
                      return prev.map(i => i.productId === p.id ? { ...i, qty } : i)
                    }
                    return [...prev, { productId: p.id, qty }]
                  })
                }} />
            </div>
          ))}
          <Button onClick={handleTransfer} className="w-full">Transférer</Button>
        </div>
      </Modal>
    </div>
  )
}
