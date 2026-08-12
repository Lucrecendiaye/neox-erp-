import Dexie, { type EntityTable } from 'dexie'
import type {
  Product, Category, StockMovement, Customer, Supplier,
  Sale, Purchase, Invoice, AccountingEntry, Account,
  Credit, CreditPayment, CreditModification, AuditLog, User, CompanySettings, Notification, Business,
  Employee, Attendance, Payroll, CashBookEntry, Lead, BusinessCard,
  AuthSession,
} from '@/types'
import type {
  Location, ProductStock, ProductHistory,
  SupplierInvoice, SupplierPayment, Compensation, Transfer, BonSortie,
} from '@/engine/types'
import type { DeletedRecord } from '@/lib/softDelete'

class NeoXDB extends Dexie {
  products!: EntityTable<Product, 'id'>
  categories!: EntityTable<Category, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  customers!: EntityTable<Customer, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  sales!: EntityTable<Sale, 'id'>
  purchases!: EntityTable<Purchase, 'id'>
  invoices!: EntityTable<Invoice, 'id'>
  accountingEntries!: EntityTable<AccountingEntry, 'id'>
  accounts!: EntityTable<Account, 'id'>
  credits!: EntityTable<Credit, 'id'>
  creditPayments!: EntityTable<CreditPayment, 'id'>
  creditModifications!: EntityTable<CreditModification, 'id'>
  auditLogs!: EntityTable<AuditLog, 'id'>
  users!: EntityTable<User, 'id'>
  settings!: EntityTable<CompanySettings, 'id'>
  notifications!: EntityTable<Notification, 'id'>
  businesses!: EntityTable<Business, 'id'>
  employees!: EntityTable<Employee, 'id'>
  attendance!: EntityTable<Attendance, 'id'>
  payrolls!: EntityTable<Payroll, 'id'>
  cashBook!: EntityTable<CashBookEntry, 'id'>
  leads!: EntityTable<Lead, 'id'>
  businessCards!: EntityTable<BusinessCard, 'id'>
  locations!: EntityTable<Location, 'id'>
  productStocks!: EntityTable<ProductStock, 'id'>
  productHistory!: EntityTable<ProductHistory, 'id'>
  supplierInvoices!: EntityTable<SupplierInvoice, 'id'>
  supplierPayments!: EntityTable<SupplierPayment, 'id'>
  compensations!: EntityTable<Compensation, 'id'>
  transfers!: EntityTable<Transfer, 'id'>
  bonSorties!: EntityTable<BonSortie, 'id'>
  deletedRecords!: EntityTable<DeletedRecord, 'id'>
  sessions!: EntityTable<AuthSession, 'id'>

  constructor() {
    super('neox_erp')
    const fullSchema = {
      products: 'id, businessId, name, barcode, categoryId, supplierId, status',
      categories: 'id, businessId, name, parentId',
      stockMovements: 'id, businessId, locationId, productId, type, createdAt',
      customers: 'id, businessId, name, phone, email',
      suppliers: 'id, businessId, name, phone, email',
      sales: 'id, businessId, locationId, invoiceNumber, customerId, status, createdAt',
      purchases: 'id, businessId, locationId, supplierId, status, createdAt',
      invoices: 'id, businessId, number, partyId, type, status, createdAt',
      accountingEntries: 'id, businessId, accountId, type, date, reference',
      accounts: 'id, businessId, code, name, type',
      credits: 'id, businessId, customerId, status, dueDate',
      creditPayments: 'id, businessId, creditId, customerId, date',
      auditLogs: 'id, businessId, userId, action, entity, createdAt',
      users: 'id, businessId, email, loginId, role, isActive, isPrimaryAdmin',
      settings: 'id',
      notifications: 'id, businessId, type, read, createdAt',
      businesses: 'id, name, isActive, createdAt',
      employees: 'id, businessId, name, department, position, status',
      attendance: 'id, businessId, employeeId, date, status',
      payrolls: 'id, businessId, employeeId, periodStart, status',
      cashBook: 'id, businessId, date, type, category',
      leads: 'id, businessId, name, phone, status, source',
      businessCards: 'id, businessId, name, design',
      locations: 'id, businessId, type, isActive',
      productStocks: 'id, businessId, productId, locationId, [productId+locationId]',
      productHistory: 'id, businessId, productId, locationId, action, createdAt',
      supplierInvoices: 'id, businessId, supplierId, number, status, createdAt',
      supplierPayments: 'id, businessId, invoiceId, date',
      compensations: 'id, businessId, partyId, direction, status',
      transfers: 'id, businessId, fromLocationId, toLocationId, status, createdAt',
      bonSorties: 'id, businessId, number, status, fromLocationId, toLocationId, transferId, createdAt',
      deletedRecords: 'id, businessId, entity, entityId, deletedAt',
      sessions: 'id, userId, businessId, revoked, expiresAt',
    }
    this.version(10).stores({
      ...fullSchema,
      sessions: 'id, userId, businessId, revoked, expiresAt',
    })
    this.version(9).stores({
      ...fullSchema,
      creditModifications: 'id, businessId, creditId, saleId, createdAt',
    })
    this.version(8).stores(fullSchema)
    this.version(7).stores(fullSchema)
  }
}

const db = new NeoXDB()

export async function initDB() {
  if (db.isOpen()) return
  try {
    await db.open()
  } catch (err) {
    console.warn('DB open failed, attempting recovery:', err)
    try {
      await db.close()
      await db.open()
    } catch {
      console.warn('DB recovery failed, recreating database')
      await db.delete()
      await db.open()
    }
  }

  const existingSettings = await db.settings.get('default')
  if (!existingSettings) {
    await db.settings.put({
      id: 'default', name: '', currency: 'XOF', currencySymbol: 'FCFA',
      currencies: [
        { code: 'XOF', symbol: 'FCFA', rate: 1, isDefault: true },
        { code: 'EUR', symbol: '€', rate: 0.0015 },
        { code: 'USD', symbol: '$', rate: 0.0016 },
      ],
      locale: 'fr-FR', language: 'fr', timezone: 'Africa/Ouagadougou',
      taxRate: 18, invoicePrefix: 'FAC-', invoiceNextNumber: 1,
    })
  }
}



export async function resetDB() {
  await db.delete()
  await initDB()
}

export default db
