import { useState } from 'react'
import { Card, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { usePagination } from '@/hooks/usePagination'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { generateId, formatCurrency, calculateMargin } from '@/lib/utils'
import type { Product } from '@/types'
import { Search, Plus, Package, Edit2, Trash2, Barcode, ScanLine, Printer } from 'lucide-react'
import BarcodeScanner from '@/components/ui/BarcodeScanner'
import PhotoUpload from '@/components/ui/PhotoUpload'
import { toast } from '@/lib/toast'
import { printBarcodeLabels } from '@/lib/barcodePrint'

export default function ProductsPage() {
  const isCloud = isSupabaseConfigured()
  const dexieProducts = useLiveQuery(() => db.products.toArray(), [])
  const dexieCategories = useLiveQuery(() => db.categories.toArray(), [])
  const { data: supabaseProducts } = useSupabaseQuery<Product>('products', undefined, [])
  const { data: supabaseCategories } = useSupabaseQuery<any>('categories', undefined, [])

  const products = isCloud ? supabaseProducts : dexieProducts
  const categories = isCloud ? supabaseCategories : dexieCategories

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', barcode: '', reference: '', categoryId: '',
    brand: '', unit: 'pièce', purchasePrice: 0, sellingPrice: 0,
    wholesalePrice: 0, taxRate: 0, stockAlert: 0, location: '',
  })
  const [photos, setPhotos] = useState<string[]>([])

  const filtered = products?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search) ||
    p.reference?.toLowerCase().includes(search.toLowerCase())
  )

  const { paginatedItems, ...pag } = usePagination(filtered)

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', barcode: '', reference: '', categoryId: '', brand: '', unit: 'pièce', purchasePrice: 0, sellingPrice: 0, wholesalePrice: 0, taxRate: 0, stockAlert: 0, location: '' })
    setPhotos([])
    setModalOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    setPhotos(product.photos || [])
    setForm({
      name: product.name, description: product.description || '',
      barcode: product.barcode || '', reference: product.reference || '',
      categoryId: product.categoryId || '', brand: product.brand || '',
      unit: product.unit, purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice, wholesalePrice: product.wholesalePrice || 0,
      taxRate: product.taxRate, stockAlert: product.stockAlert || 0,
      location: product.location || '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      if (editing) {
        if (isCloud) {
          await sb.update('products', editing.id, {
            ...form,
            photos,
            margin: calculateMargin(form.purchasePrice, form.sellingPrice),
            updatedAt: now,
          })
        } else {
          await db.products.update(editing.id, {
            ...form,
            photos,
            margin: calculateMargin(form.purchasePrice, form.sellingPrice),
            updatedAt: now,
          })
        }
        toast('Produit mis à jour', 'success')
      } else {
        const product = {
          id: generateId(),
          businessId: 'biz-default',
          ...form,
          photos,
          margin: calculateMargin(form.purchasePrice, form.sellingPrice),
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
        }
        if (isCloud) {
          await sb.insert('products', product)
        } else {
          await db.products.add(product)
        }
        toast('Produit créé', 'success')
      }
      setModalOpen(false)
    } catch { toast('Erreur lors de l\'enregistrement', 'error') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce produit ?')) return
    if (isCloud) {
      await sb.remove('products', id)
    } else {
      await db.products.delete(id)
    }
    toast('Produit supprimé', 'success')
  }

  function handleBarcodeScan(code: string) {
    const found = products?.find(p => p.barcode === code)
    if (found) {
      openEdit(found)
    } else {
      setForm(prev => ({ ...prev, barcode: code }))
      if (!modalOpen) {
        setModalOpen(true)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Produits</h1>
        <p className="text-surface-500 text-sm mt-1">Gérez votre catalogue de produits</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text" placeholder="Rechercher un produit..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button onClick={() => setScannerOpen(true)} className="p-2.5 rounded-xl border border-surface-300 bg-white text-surface-500 hover:bg-surface-50 transition-colors" title="Scanner un code-barres">
            <ScanLine className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => printBarcodeLabels(filtered || [])} title="Imprimer étiquettes">
            <Printer className="w-4 h-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Nouveau produit
          </Button>
        </div>
      </div>
      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Produit</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Catégorie</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Prix achat</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Prix vente</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Marge</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems?.map((p) => (
                <tr key={p.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 overflow-hidden">
                        {p.photos?.[0] ? <img src={p.photos[0]} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{p.name}</p>
                        <p className="text-xs text-surface-400">{p.barcode || p.reference || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-600">{categories?.find((c: any) => c.id === p.categoryId)?.name || '—'}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(p.purchasePrice)}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-surface-900">{formatCurrency(p.sellingPrice)}</td>
                  <td className="px-6 py-4 text-right">
                    <Badge variant={p.margin >= 20 ? 'success' : p.margin >= 10 ? 'warning' : 'danger'}>
                      {p.margin.toFixed(0)}%
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-surface-400 text-sm">
                    Aucun produit trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le produit' : 'Nouveau produit'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom du produit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Code-barres" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} icon={<Barcode className="w-4 h-4" />} />
            <Select label="Catégorie" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} options={(categories || []).map((c: any) => ({ value: c.id, label: c.name }))} placeholder="Sélectionner..." />
            <Input label="Marque" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <Input label="Référence" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            <Input label="Unité" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <PhotoUpload photos={photos} onChange={setPhotos} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Prix d'achat" type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: +e.target.value })} />
            <Input label="Prix de vente" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: +e.target.value })} />
            <Input label="Prix de gros" type="number" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: +e.target.value })} />
          </div>
          {form.purchasePrice > 0 && (
            <p className="text-sm text-surface-500">
              Marge : <span className="font-semibold text-success">{calculateMargin(form.purchasePrice, form.sellingPrice).toFixed(1)}%</span>
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="TVA (%)" type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: +e.target.value })} />
            <Input label="Alerte stock" type="number" value={form.stockAlert} onChange={(e) => setForm({ ...form, stockAlert: +e.target.value })} />
            <Input label="Emplacement" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>
    </div>
  )
}
