export type ProductStatus = 'active' | 'inactive' | 'discontinued'
export type ProductUnit = 'piece' | 'dozen' | 'pack'

export interface Product {
  id: string
  businessId: string
  name: string
  description?: string
  photos: string[]
  barcode?: string
  qrCode?: string
  reference?: string
  categoryId?: string
  brand?: string
  unit: ProductUnit
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
  priceDozen?: number
  pricePack?: number
  packSize?: number
  margin: number
  taxRate: number
  stockAlert?: number
  stockMin?: number
  stockMax?: number
  location?: string
  supplierId?: string
  status: ProductStatus
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  businessId: string
  name: string
  description?: string
  parentId?: string
  createdAt: string
}

export interface StockMovement {
  id: string
  businessId: string
  locationId: string
  productId: string
  type: 'in' | 'out' | 'adjustment' | 'transfer' | 'inventory'
  quantity: number
  unitPrice?: number
  reference?: string
  note?: string
  createdAt: string
  userId: string
}

export interface Customer {
  id: string
  businessId: string
  name: string
  phone: string
  email?: string
  address?: string
  creditLimit: number
  currentBalance: number
  advanceBalance?: number
  notes?: string
  photo?: string
  createdAt: string
  updatedAt: string
}

/**
 * Grand livre du compte client — chaque ligne est un mouvement immuable.
 * Le solde (avance / dette / prêt) est toujours recalculé depuis ces entrées,
 * jamais stocké de façon mutable.
 *
 * - advance_received : le client a déposé de l'argent en trop (son argent chez moi)
 * - advance_used     : l'avance a servi à payer une vente
 * - advance_refunded : j'ai rendu l'avance au client
 * - loan_given       : je lui ai prêté de l'argent (mon argent chez lui)
 * - loan_repaid      : il m'a remboursé un prêt
 * - credit_created   : dette née d'une vente à crédit
 * - credit_paid      : paiement d'une dette
 */
export type CustomerEntryType =
  | 'advance_received'
  | 'advance_used'
  | 'advance_refunded'
  | 'loan_given'
  | 'loan_repaid'
  | 'credit_created'
  | 'credit_paid'

export interface CustomerEntry {
  id: string
  businessId: string
  customerId: string
  customerName: string
  type: CustomerEntryType
  /** Montant en FCFA (toujours positif ; le sens est donné par `type`). */
  amount: number
  date: string
  /** Référence libre (n° facture, n° prêt, etc.). */
  reference?: string
  note?: string
  /** Id de l'objet lié (sale, loan, credit, ...). */
  linkedId?: string
  /** Catégorie d'affichage pour le relevé. */
  category?: string
  userId: string
  createdAt: string
}


export interface Supplier {
  id: string
  businessId: string
  name: string
  phone: string
  email?: string
  address?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type SaleStatus = 'pending' | 'completed' | 'cancelled' | 'returned'
export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'credit' | 'bank' | 'split' | 'wave' | 'orange'

export interface SaleItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  total: number
  unitName?: string
  unitQuantity?: number
  locationId?: string
  locationName?: string
}

export interface SplitPaymentItem {
  method: PaymentMethod
  amount: number
}

export interface Sale {
  id: string
  businessId: string
  locationId: string
  invoiceNumber: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  supplierId?: string
  supplierName?: string
  saleType?: 'shop' | 'delivery'
  items: SaleItem[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paid: number
  change: number
  paymentMethod: PaymentMethod
  splitPayments?: SplitPaymentItem[]
  status: SaleStatus
  paymentStatus?: 'unpaid' | 'partial' | 'paid'
  note?: string
  createdAt: string
  userId: string
}

export type DeliveryStatus = 'draft' | 'validated' | 'prepared' | 'in_transit' | 'delivered' | 'cancelled' | 'failed'

export type DeliveryPaymentStatus = 'prepaid' | 'pending' | 'partial' | 'full'

export interface DeliveryItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  unitName?: string
  unitQuantity?: number
  total: number
  locationId?: string
}

export interface DeliveryPayment {
  id: string
  kind: 'advance' | 'cod'
  method: PaymentMethod
  amount: number
  date: string
  userId: string
  userName: string
  note?: string
}

export interface Delivery {
  id: string
  businessId: string
  number: string
  saleId?: string
  locationId: string
  status: DeliveryStatus
  paymentStatus: DeliveryPaymentStatus
  paymentMethod: PaymentMethod | ''
  customerId?: string
  customerName: string
  customerPhone?: string
  customerAddress?: string
  quarter?: string
  deliveryNote?: string
  items: DeliveryItem[]
  subtotal: number
  discount: number
  deliveryFee: number
  deliveryFeeClient: number
  deliveryFeeShop: number
  total: number
  paid: number
  courierId?: string
  courierName?: string
  plannedDate?: string
  createdById: string
  createdByName: string
  createdAt: string
  updatedAt: string
  deliveredAt?: string
  cancelledAt?: string
  returnedAt?: string
  cancelReason?: string
  stockReturned?: boolean
  refund?: number
  payments: DeliveryPayment[]
  courierPayDecision?: {
    decided: boolean
    payCourier: boolean
    amount: number
    decidedAt: string
    decidedBy: string
    decidedByName: string
  }
}

export interface Purchase {
  id: string
  businessId: string
  locationId: string
  supplierId?: string
  supplierName?: string
  items: SaleItem[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paid: number
  status: SaleStatus
  note?: string
  createdAt: string
  userId: string
}

export interface Invoice {
  id: string
  businessId: string
  type: 'sale' | 'purchase' | 'credit_note' | 'debit_note'
  number: string
  partyId?: string
  partyName?: string
  partyPhone?: string
  items: SaleItem[]
  subtotal: number
  taxTotal: number
  total: number
  paid: number
  dueDate?: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  createdAt: string
  userId: string
}

export interface AccountingEntry {
  id: string
  businessId: string
  date: string
  type: 'revenue' | 'expense' | 'transfer' | 'credit' | 'debit'
  accountId: string
  accountName: string
  amount: number
  direction: 'debit' | 'credit'
  reference: string
  description?: string
  linkedId?: string
  linkedType?: string
  createdAt: string
  userId: string
}

export interface Account {
  id: string
  businessId: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  balance: number
  createdAt: string
}

export interface CreditPayment {
  id: string
  businessId: string
  creditId: string
  saleId?: string
  customerId: string
  amount: number
  method: PaymentMethod
  date: string
  note?: string
  userId: string
  createdAt: string
}

export interface Credit {
  id: string
  businessId: string
  customerId: string
  customerName: string
  invoiceId?: string
  amount: number
  paid: number
  balance: number
  dueDate: string
  status: 'active' | 'paid' | 'overdue' | 'defaulted'
  reminderSent: string[]
  createdAt: string
}

export interface CreditModification {
  id: string
  businessId: string
  creditId: string
  saleId?: string
  field: string
  oldValue: string
  newValue: string
  reason?: string
  userId: string
  createdAt: string
}

export interface AuditLog {
  id: string
  businessId: string
  userId: string
  userName?: string
  userLoginId?: string
  userRole?: string
  action: string
  entity: string
  entityId: string
  details?: string
  ip?: string
  oldData?: string
  newData?: string
  createdAt: string
}

export interface User {
  id: string
  authUserId?: string
  businessId: string
  name: string
  email: string
  phone?: string
  loginId: string
  passwordHash: string
  role: 'admin' | 'manager' | 'staff' | 'viewer'
  avatar?: string
  permissions: string[]
  isActive: boolean
  isPrimaryAdmin: boolean
  status?: UserStatus
  employeeId?: string
  createdAt: string
  lastLogin?: string
}

export type UserStatus = 'active' | 'blocked' | 'suspended' | 'deleted'

export interface AuthSession {
  id: string
  userId: string
  businessId: string
  token: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  device?: string
  revoked: boolean
}

export interface CurrencyRate {
  code: string
  symbol: string
  rate: number
  isDefault?: boolean
}

export interface CompanySettings {
  id?: string
  name: string
  slogan?: string
  logo?: string
  currency: string
  currencySymbol: string
  currencies: CurrencyRate[]
  locale: string
  language: string
  timezone: string
  taxRate: number
  invoicePrefix: string
  invoiceNextNumber: number
  deliveryPrefix: string
  deliveryNextNumber: number
  email?: string
  phone?: string
  address?: string
  website?: string
  ninea?: string
  rccm?: string
  managerName?: string
  accountNumber?: string
  bankName?: string
  invoiceNotes?: string
  alertSettings?: AlertSettings
}

export interface Business {
  id: string
  name: string
  logo?: string
  currency: string
  currencySymbol: string
  phone?: string
  email?: string
  address?: string
  taxId?: string
  isActive: boolean
  createdAt: string
}

export interface Employee {
  id: string
  businessId: string
  name: string
  phone: string
  email?: string
  position: string
  department: string
  salary: number
  salaryType: 'monthly' | 'daily' | 'hourly'
  paymentMethod: PaymentMethod
  bankAccount?: string
  address?: string
  photo?: string
  documents: string[]
  hireDate: string
  status: 'active' | 'inactive' | 'terminated'
  createdAt: string
  updatedAt: string
}

export interface Attendance {
  id: string
  businessId: string
  employeeId: string
  date: string
  checkIn: string
  checkOut?: string
  status: 'present' | 'absent' | 'late' | 'half-day' | 'leave'
  note?: string
  createdAt: string
}

export interface Payroll {
  id: string
  businessId: string
  employeeId: string
  employeeName: string
  periodStart: string
  periodEnd: string
  baseSalary: number
  allowances: number
  deductions: number
  bonus: number
  netSalary: number
  daysWorked: number
  status: 'draft' | 'paid' | 'cancelled'
  paidAt?: string
  createdAt: string
  userId: string
}

export interface CashBookEntry {
  id: string
  businessId: string
  date: string
  type: 'in' | 'out'
  category: string
  amount: number
  description?: string
  partyId?: string
  partyName?: string
  paymentMethod: PaymentMethod
  reference?: string
  attachment?: string
  linkedId?: string
  createdAt: string
  userId: string
}

export type CashOperationType = 'in' | 'out'
export type CashOperationStatus = 'pending' | 'completed' | 'cancelled'
export type CashOutNature = 'charge' | 'dépense' | 'retrait' | 'transfert' | 'autre'

export interface CashOperation {
  id: string
  businessId: string
  number: string
  type: CashOperationType
  amount: number
  categoryId?: string
  categoryName?: string
  description?: string
  partyName?: string
  paymentMethod: PaymentMethod
  locationId?: string
  locationName?: string
  status: CashOperationStatus
  nature?: CashOutNature
  date: string
  reference?: string
  receiptPhoto?: string
  balanceAfter?: number
  userId: string
  userName?: string
  createdAt: string
  updatedAt?: string
  cancelledAt?: string
  cancelledBy?: string
  cancelReason?: string
}

export interface CashCategory {
  id: string
  businessId: string
  name: string
  type: 'in' | 'out' | 'both'
  isDefault?: boolean
  color?: string
  active?: boolean
  createdAt: string
}

export interface Lead {
  id: string
  businessId: string
  name: string
  phone: string
  email?: string
  company?: string
  source: string
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  notes?: string
  assignedTo?: string
  expectedValue: number
  createdAt: string
  updatedAt: string
}

export interface Notification {
  id: string
  businessId: string
  type: 'stock_alert' | 'credit_due' | 'new_sale' | 'payment_received' | 'invoice_overdue' | 'payroll' | 'lead'
    | 'delivery_assigned' | 'delivery_reassigned' | 'delivery_return' | 'stock_transfer'
    | 'sensitive_delete' | 'sensitive_edit' | 'reminder_due' | 'loan_alert'
  title: string
  message: string
  read: boolean
  link?: string
  recipientId?: string
  senderId?: string
  transferId?: string
  shopId?: string
  createdAt: string
}

export type LoanStatus = 'active' | 'partial' | 'paid' | 'cancelled'

export interface Loan {
  id: string
  businessId: string
  number: string
  partyKind: 'customer' | 'supplier'
  partyId: string
  partyName: string
  amount: number
  paid: number
  balance: number
  dueDate?: string
  rate?: number
  note?: string
  status: LoanStatus
  createdAt: string
  userId: string
  userName?: string
}

export interface LoanPayment {
  id: string
  businessId: string
  loanIds: string[]
  partyKind: 'customer' | 'supplier'
  partyId: string
  amount: number
  method: PaymentMethod
  note?: string
  date: string
  userId: string
  createdAt: string
}

export type ReminderStatus = 'upcoming' | 'today' | 'overdue' | 'done' | 'postponed'

export interface DebtReminder {
  id: string
  businessId: string
  creditId?: string
  saleId?: string
  customerId: string
  customerName: string
  customerPhone?: string
  debtAmount: number
  paidAmount: number
  dueDate?: string
  remindDate: string
  status: ReminderStatus
  note?: string
  notified?: boolean
  createdAt: string
  updatedAt: string
  userId: string
}

export interface AlertSettings {
  saleDelete: boolean
  saleEdit: boolean
  paymentEdit: boolean
  loanDelete: boolean
  stockManual: boolean
  cashEdit: boolean
  thresholdSaleEdit: number
  thresholdExpense: number
  thresholdLoan: number
  thresholdDebt: number
  thresholdStock: number
}

export interface BusinessCard {
  id: string
  businessId: string
  name: string
  phone: string
  email?: string
  address?: string
  website?: string
  logo?: string
  design: number
  createdAt: string
}
