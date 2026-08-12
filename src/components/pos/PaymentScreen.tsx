import { useMemo, useState } from 'react'
import { cn, formatCurrency, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { PAY_METHOD_LABELS, type PayMethod, type useSalePayment } from '@/modules/pos/salePayment'
import {
  Banknote, Smartphone, Phone, CreditCard, Calendar, ChevronLeft, User, MapPin,
  Check, AlertTriangle, HandCoins, Contact as ContactIcon, ChevronDown, X, Truck,
} from 'lucide-react'
import type { Customer, Supplier } from '@/types'

type PaymentHook = ReturnType<typeof useSalePayment>

interface PaymentScreenProps {
  open: boolean
  onBack: () => void
  subtotal: number
  discount: number
  total: number
  pay: PaymentHook
  customers: Customer[]
  customerId: string
  setCustomerId: (id: string) => void
  customerName: string
  setCustomerName: (v: string) => void
  customerPhone: string
  setCustomerPhone: (v: string) => void
  customerAddress: string
  setCustomerAddress: (v: string) => void
  customerOpen: boolean
  setCustomerOpen: (v: boolean) => void
  onConfirm: (createCustomer?: boolean) => void
  suppliers?: Supplier[]
  supplierId?: string
  setSupplierId?: (id: string) => void
  supplierName?: string
  setSupplierName?: (v: string) => void
  supplierPhone?: string
  setSupplierPhone?: (v: string) => void
}

const GIANT_METHODS: { key: PayMethod | 'credit'; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'cash', label: 'Espèces', icon: <Banknote className="w-7 h-7" />, color: 'bg-emerald-500' },
  { key: 'wave', label: 'Wave', icon: <Smartphone className="w-7 h-7" />, color: 'bg-blue-500' },
  { key: 'orange', label: 'Orange Money', icon: <Phone className="w-7 h-7" />, color: 'bg-orange-500' },
  { key: 'card', label: 'Carte', icon: <CreditCard className="w-7 h-7" />, color: 'bg-violet-500' },
  { key: 'credit', label: 'Crédit', icon: <HandCoins className="w-7 h-7" />, color: 'bg-amber-500' },
]

export default function PaymentScreen(props: PaymentScreenProps) {
  const { open, onBack, total, subtotal, discount, pay } = props
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pendingNewCustomer, setPendingNewCustomer] = useState(false)

  const suggestions = useMemo(() => {
    const q = props.customerName.trim().toLowerCase()
    if (!q) return []
    return props.customers
      .filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
      .slice(0, 5)
  }, [props.customerName, props.customers])

  if (!open) return null

  const isCredit = pay.paymentType === 'credit'
  const isCash = pay.paymentType === 'complet' && pay.payMethod === 'cash'
  const showChange = isCash && pay.change > 0
  const showShort = isCash && pay.isShort

  const activeKey: PayMethod | 'credit' = isCredit ? 'credit' : pay.payMethod

  const typedNameMatches = props.customerName.trim().length > 0 &&
    !props.customerId &&
    props.customers.some(c => (c.name || '').toLowerCase() === props.customerName.trim().toLowerCase())

  function selectMethod(key: PayMethod | 'credit') {
    if (key === 'credit') {
      pay.setPaymentType('credit')
      pay.setPayMethod('cash')
    } else {
      pay.setPaymentType('complet')
      pay.setPayMethod(key)
    }
  }

  function handleSelectCustomer(c: Customer) {
    props.setCustomerId(c.id)
    props.setCustomerName(c.name)
    props.setCustomerPhone(c.phone || '')
    props.setCustomerAddress(c.address || '')
    setShowSuggestions(false)
  }

  async function handleImportContact() {
    const c = await pickContact()
    if (c) {
      props.setCustomerName(c.name)
      props.setCustomerPhone(c.tel)
      setShowSuggestions(true)
      toast('Contact importé', 'success')
    }
  }

  function handleConfirm() {
    const hasName = props.customerName.trim().length > 0
    const isNew = hasName && !props.customerId && !typedNameMatches
    if (isNew) {
      setPendingNewCustomer(true)
      return
    }
    props.onConfirm(hasName ? (typedNameMatches ? true : !props.customerId) : undefined)
  }

  function handleNewCustomerDecision(create: boolean) {
    setPendingNewCustomer(false)
    props.onConfirm(create)
  }

  const canConfirm = !pay.isShort && total > 0 && (!isCredit || props.customerName.trim().length > 0)

  return (
    <div className="fixed inset-0 z-[60] bg-surface-50 lg:hidden flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-2 pt-2 safe-area-top">
        <button onClick={onBack} className="touch-target rounded-xl text-surface-500 hover:text-surface-900 transition-colors">
          <ChevronLeft className="w-7 h-7" />
        </button>
        <h1 className="text-lg font-bold text-surface-900">Paiement</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Total */}
        <div className="bg-surface-100 border border-surface-200 rounded-3xl p-5 shadow-sm text-center">
          <p className="text-sm text-surface-500 font-medium">TOTAL À PAYER</p>
          <p className="text-5xl font-extrabold text-primary-500 mt-1 tracking-tight">{formatCurrency(total)}</p>
          <div className="flex justify-center gap-6 mt-3 text-xs text-surface-500">
            <span>Sous-total : <span className="text-surface-900 font-semibold">{formatCurrency(subtotal)}</span></span>
            {discount > 0 && <span>Remise : <span className="text-surface-900 font-semibold">-{formatCurrency(discount)}</span></span>}
          </div>
        </div>

        {/* Client (toujours visible) */}
        <div className="bg-surface-100 border border-surface-200 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-surface-900">Client {isCredit && <span className="text-red-400">*</span>}</p>
            <button type="button" onClick={async () => { await handleImportContact() }}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-600 transition-colors">
              <ContactIcon className="w-4 h-4" /> Importer
            </button>
          </div>

          {props.customerId && (
            <div className="flex items-center justify-between rounded-xl bg-primary-50 border border-primary-200 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 text-primary-400 shrink-0" />
                <span className="text-sm font-semibold text-surface-900 truncate">{props.customerName}</span>
                {props.customerPhone && <span className="text-xs text-surface-500">{props.customerPhone}</span>}
              </div>
              <button onClick={() => { props.setCustomerId(''); setShowSuggestions(false) }} className="shrink-0 p-1 rounded-lg text-surface-400 hover:text-danger transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
            <input
              value={props.customerName}
              onChange={(e) => { props.setCustomerName(e.target.value); if (props.customerId) props.setCustomerId(''); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Nom du client (ou laisser vide)"
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-50 border border-surface-300 text-base text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[48px]"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-surface-100 border border-surface-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto">
                {suggestions.map(c => (
                  <button key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectCustomer(c)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-400 flex items-center justify-center text-sm font-bold shrink-0">
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-surface-900 truncate">{c.name}</p>
                      {c.phone && <p className="text-xs text-surface-500">{c.phone}</p>}
                    </div>
                    <ChevronDown className="w-4 h-4 text-surface-400 -rotate-90 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
            <input
              value={props.customerPhone}
              onChange={(e) => props.setCustomerPhone(e.target.value)}
              placeholder="Téléphone"
              inputMode="tel"
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-50 border border-surface-300 text-base text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[48px]"
            />
          </div>
          {props.customerOpen && (
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
              <input
                value={props.customerAddress}
                onChange={(e) => props.setCustomerAddress(e.target.value)}
                placeholder="Adresse"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-50 border border-surface-300 text-base text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[48px]"
              />
            </div>
          )}
          {!props.customerId && props.customerName.trim() && !typedNameMatches && (
            <p className="text-xs text-amber-500 font-medium">
              « {props.customerName.trim()} » n'est pas un client enregistré — vous serez invité à confirmer son ajout
            </p>
          )}
        </div>

        {/* Fournisseur (optionnel, vente dépôt) */}
        {props.suppliers && (
          <div className="bg-surface-100 border border-surface-200 rounded-3xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-surface-900">Fournisseur <span className="text-surface-400 font-normal">(optionnel)</span></p>
              {props.supplierId && (
                <button onClick={() => { props.setSupplierId?.(''); props.setSupplierName?.(''); props.setSupplierPhone?.('') }} className="shrink-0 p-1 rounded-lg text-surface-400 hover:text-danger transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {props.supplierId && (
              <div className="flex items-center gap-2 rounded-xl bg-primary-50 border border-primary-200 px-3 py-2">
                <Truck className="w-4 h-4 text-primary-400 shrink-0" />
                <span className="text-sm font-semibold text-surface-900 truncate">{props.supplierName}</span>
                {props.supplierPhone && <span className="text-xs text-surface-500">{props.supplierPhone}</span>}
              </div>
            )}
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
              <input
                value={props.supplierName}
                onChange={(e) => { props.setSupplierName?.(e.target.value); if (props.supplierId) props.setSupplierId?.('') }}
                placeholder="Nom du fournisseur (si vente au fournisseur)"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-50 border border-surface-300 text-base text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[48px]"
              />
              {props.supplierName?.trim() && !props.supplierId && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-surface-100 border border-surface-200 rounded-xl shadow-xl z-20 max-h-44 overflow-y-auto">
                  {props.suppliers.filter(s => (s.name || '').toLowerCase().includes(props.supplierName!.trim().toLowerCase()) || (s.phone || '').includes(props.supplierName!.trim())).slice(0, 5).map(s => (
                    <button key={s.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { props.setSupplierId?.(s.id); props.setSupplierName?.(s.name); props.setSupplierPhone?.(s.phone || '') }}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-50 transition-colors">
                      <Truck className="w-4 h-4 text-surface-400 shrink-0" />
                      <span className="text-sm text-surface-700 truncate">{s.name}</span>
                      {s.phone && <span className="text-xs text-surface-400 ml-auto">{s.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {props.supplierName?.trim() && !props.supplierId && (
              <p className="text-xs text-amber-500 font-medium">
                « {props.supplierName.trim()} » sera enregistré comme nouveau fournisseur à la validation
              </p>
            )}
          </div>
        )}

        {/* Giant method buttons */}
        <div>
          <p className="text-sm font-semibold text-surface-900 mb-2">Mode de paiement</p>
          <div className="grid grid-cols-2 gap-3">
            {GIANT_METHODS.map(m => (
              <button
                key={m.key}
                onClick={() => selectMethod(m.key)}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 py-5 rounded-2xl font-bold text-sm transition-all active:scale-[0.97]',
                  activeKey === m.key
                    ? 'bg-surface-900 text-surface-50 ring-2 ring-surface-900 shadow-lg'
                    : 'bg-surface-100 border border-surface-200 text-surface-700 shadow-sm'
                )}
                style={activeKey === m.key ? {} : undefined}
              >
                <span className={cn('w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md', m.color)}>
                  {m.icon}
                </span>
                <span>{m.label}</span>
                {activeKey === m.key && <Check className="w-4 h-4 absolute top-3 right-3" />}
              </button>
            ))}
          </div>
        </div>

        {/* Cash: montant reçu + monnaie */}
        {isCash && (
          <div className="bg-surface-100 border border-surface-200 rounded-2xl p-4 shadow-sm">
            <label className="block text-sm font-semibold text-surface-900 mb-2">Montant reçu</label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                <input
                  type="number" min="0" value={pay.amountReceived || ''}
                  placeholder="Montant reçu"
                  autoFocus
                  onChange={(e) => pay.setAmountReceived(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full pl-11 pr-4 py-4 rounded-xl bg-surface-50 border border-surface-300 text-lg font-bold text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[56px]"
                  inputMode="numeric"
                />
              </div>
            </div>
            {showChange && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                <span className="text-sm font-semibold text-emerald-500">Monnaie à rendre</span>
                <span className="text-2xl font-extrabold text-emerald-500">{formatCurrency(pay.change)}</span>
              </div>
            )}
            {showShort && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm font-semibold text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Manque {formatCurrency(total - pay.amountReceived)} — passez en Crédit pour un paiement partiel
              </div>
            )}
          </div>
        )}

        {/* Non-cash complet */}
        {pay.paymentType === 'complet' && pay.payMethod !== 'cash' && (
          <div className="flex items-center justify-between rounded-2xl bg-primary-50 border border-primary-200 px-4 py-3">
            <span className="text-sm font-semibold text-primary-400">Montant encaissé via {PAY_METHOD_LABELS[pay.payMethod]}</span>
            <span className="text-2xl font-extrabold text-primary-500">{formatCurrency(total)}</span>
          </div>
        )}

        {/* Crédit */}
        {isCredit && (
          <div className="bg-surface-100 border border-amber-500/40 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-amber-500" />
              <p className="font-bold text-surface-900">Vente à crédit</p>
            </div>

            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-surface-400 shrink-0" />
              <input
                type="number" min="0" max={total} value={pay.amountReceived || ''}
                placeholder="Montant payé maintenant (optionnel)"
                inputMode="numeric"
                onChange={(e) => pay.setAmountReceived(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
                className="w-full px-4 py-3 rounded-xl bg-surface-50 border border-surface-300 text-base text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[48px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-surface-400 shrink-0" />
              <input
                type="date"
                value={pay.dueDate}
                onChange={(e) => pay.setDueDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface-50 border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[48px]"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-amber-500/15 border border-amber-500/40 px-4 py-3">
              <span className="text-sm font-bold text-amber-600">Reste à payer</span>
              <span className="text-3xl font-extrabold text-amber-600">{formatCurrency(Math.max(0, total - pay.paid))}</span>
            </div>
            {!props.customerName.trim() && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" /> Client requis pour une vente à crédit
              </p>
            )}
          </div>
        )}
      </div>

      {/* Validate */}
      <div className="shrink-0 border-t border-surface-200 bg-surface-100 px-4 pt-3 pb-3 safe-area-bottom">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || (isCredit && !props.customerName.trim())}
          className={cn(
            'w-full py-4 rounded-2xl text-lg font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98]',
            canConfirm && (!isCredit || props.customerName.trim())
              ? 'bg-primary-500 text-on-accent shadow-lg shadow-primary-200'
              : 'bg-surface-100 text-surface-400'
          )}
        >
          <Check className="w-6 h-6" />
          {isCredit
            ? `Enregistrer le crédit (${formatCurrency(Math.max(0, total - pay.paid))} restant)`
            : showChange
              ? `Valider · rendre ${formatCurrency(pay.change)}`
              : `Valider ${formatCurrency(total)}`}
        </button>
      </div>

      {/* Confirmation nouveau client */}
      {pendingNewCustomer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fade-in">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setPendingNewCustomer(false)} />
          <div className="relative w-[95%] sm:w-[400px] bg-surface-100 rounded-[20px] shadow-2xl p-5 animate-scale-in">
            <div className="w-12 h-12 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6 text-primary-500" />
            </div>
            <h3 className="text-center text-base font-bold text-surface-900">Nouveau client</h3>
            <p className="text-center text-sm text-surface-500 mt-2 leading-relaxed">
              « <span className="font-semibold text-surface-900">{props.customerName.trim()}</span> » n'est pas un client enregistré.
              <br />Voulez-vous l'ajouter comme nouveau client ?
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={() => handleNewCustomerDecision(true)}
                className="w-full py-3.5 rounded-xl bg-primary-500 text-on-accent font-bold text-sm transition-all active:scale-[0.98]">
                Oui, ajouter ce client
              </button>
              <button onClick={() => handleNewCustomerDecision(false)}
                className="w-full py-3.5 rounded-xl bg-surface-100 border border-surface-200 text-surface-700 font-semibold text-sm transition-all active:scale-[0.98]">
                Non, sans enregistrer le client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
