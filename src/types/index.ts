export type ProductStatus = 'active' | 'inactive' | 'discontinued'

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
  unit: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
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
  notes?: string
  photo?: string
  createdAt: string
  updatedAt: string
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
export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'credit' | 'bank'

export interface SaleItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  total: number
}

export interface Sale {
  id: string
  businessId: string
  invoiceNumber: string
  customerId?: string
  customerName?: string
  items: SaleItem[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paid: number
  change: number
  paymentMethod: PaymentMethod
  status: SaleStatus
  note?: string
  createdAt: string
  userId: string
}

export interface Purchase {
  id: string
  businessId: string
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

export interface AuditLog {
  id: string
  businessId: string
  userId: string
  action: string
  entity: string
  entityId: string
  details?: string
  ip?: string
  createdAt: string
}

export interface User {
  id: string
  businessId: string
  name: string
  email: string
  phone?: string
  passwordHash: string
  role: 'admin' | 'manager' | 'staff' | 'viewer'
  avatar?: string
  permissions: string[]
  isActive: boolean
  createdAt: string
  lastLogin?: string
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
  email?: string
  phone?: string
  address?: string
  website?: string
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
  createdAt: string
  userId: string
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
  title: string
  message: string
  read: boolean
  link?: string
  createdAt: string
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
