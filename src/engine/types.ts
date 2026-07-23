export type LocationType = 'shop' | 'warehouse'

export interface Location {
  id: string
  businessId: string
  name: string
  type: LocationType
  address?: string
  phone?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductStock {
  id: string
  businessId: string
  productId: string
  locationId: string
  quantity: number
  stockAlert: number
  stockMin: number
  stockMax: number
  updatedAt: string
}

export type ProductHistoryAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'purchased'
  | 'sold'
  | 'returned'
  | 'adjusted'
  | 'transferred_in'
  | 'transferred_out'
  | 'price_changed'
  | 'inventory'
  | 'supplier_entry'
  | 'supplier_exit'

export interface ProductHistory {
  id: string
  businessId: string
  productId: string
  locationId: string
  action: ProductHistoryAction
  quantityBefore: number
  quantityAfter: number
  userId: string
  reference?: string
  comment?: string
  createdAt: string
}

export type PaymentType = 'cash' | 'bank' | 'mobile' | 'check' | 'product' | 'mixed'

export interface PaymentLine {
  id: string
  type: PaymentType
  amount: number
  productId?: string
  productQty?: number
  reference?: string
  description?: string
}

export type SupplierInvoiceStatus = 'draft' | 'paid' | 'partial' | 'credit' | 'cancelled'

export interface SupplierInvoice {
  id: string
  businessId: string
  supplierId: string
  number: string
  items: SupplierInvoiceItem[]
  subtotal: number
  taxTotal: number
  total: number
  paid: number
  balance: number
  status: SupplierInvoiceStatus
  dueDate?: string
  payments: SupplierPayment[]
  createdAt: string
  userId: string
}

export interface SupplierInvoiceItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export interface SupplierPayment {
  id: string
  invoiceId: string
  lines: PaymentLine[]
  amount: number
  date: string
  userId: string
  note?: string
  createdAt: string
}

export interface Compensation {
  id: string
  businessId: string
  partyId: string
  partyType: 'supplier' | 'customer'
  direction: 'debt_to_goods' | 'goods_to_debt'
  referenceInvoiceId: string
  amount: number
  items: CompensationItem[]
  settledAmount: number
  balance: number
  status: 'pending' | 'completed' | 'cancelled'
  createdAt: string
  userId: string
}

export interface CompensationItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Transfer {
  id: string
  businessId: string
  fromLocationId: string
  toLocationId: string
  items: TransferItem[]
  status: 'pending' | 'completed' | 'cancelled'
  validatedBy?: string
  validatedAt?: string
  createdAt: string
  userId: string
}

export interface TransferItem {
  productId: string
  productName: string
  quantity: number
}


