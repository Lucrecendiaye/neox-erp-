import Dexie, { type EntityTable } from 'dexie'
import type {
  Product, Category, StockMovement, Customer, Supplier,
  Sale, Purchase, Invoice, AccountingEntry, Account,
  Credit, AuditLog, User, CompanySettings, Notification, Business,
  Employee, Attendance, Payroll, CashBookEntry, Lead, BusinessCard,
} from '@/types'
import type {
  Location, ProductStock, ProductHistory,
  SupplierInvoice, SupplierPayment, Compensation, Transfer,
} from '@/engine/types'

const BIZ = 'biz-default'
const USER = 'admin'

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

  constructor() {
    super('neox_erp')
    this.version(3).stores({
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
      auditLogs: 'id, businessId, userId, action, entity, createdAt',
      users: 'id, businessId, email, role, isActive',
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
      productStocks: 'id, businessId, productId, locationId',
      productHistory: 'id, businessId, productId, locationId, action, createdAt',
      supplierInvoices: 'id, businessId, supplierId, number, status, createdAt',
      supplierPayments: 'id, businessId, invoiceId, date',
      compensations: 'id, businessId, partyId, direction, status',
      transfers: 'id, businessId, fromLocationId, toLocationId, status, createdAt',
    })
  }
}

const db = new NeoXDB()

export async function initDB() {
  try {
    await db.open()
    await db.settings.toArray()
  } catch {
    await db.delete()
    await db.open()
  }

  if ((await db.businesses.count()) === 0) {
    await db.businesses.add({
      id: BIZ, name: 'NeoX Shop', currency: 'XOF', currencySymbol: 'FCFA',
      phone: '+226 70 00 00 00', email: 'contact@neoxshop.com',
      address: 'Ouagadougou, Burkina Faso', isActive: true,
      createdAt: new Date().toISOString(),
    })
  }

  if ((await db.locations.count()) === 0) {
    const now = new Date().toISOString()
    await db.locations.bulkAdd([
      { id: 'loc-shop', businessId: BIZ, name: 'Boutique Principale', type: 'shop', address: 'Ouagadougou', phone: '+226 70 00 00 00', isActive: true, createdAt: now, updatedAt: now },
      { id: 'loc-warehouse1', businessId: BIZ, name: 'Dépôt Principal', type: 'warehouse', address: 'Zone Industrielle', phone: '+226 70 00 00 01', isActive: true, createdAt: now, updatedAt: now },
    ])
  }

  if ((await db.settings.count()) === 0) {
    await db.settings.add({
      id: 'default', name: 'NeoX Shop', currency: 'XOF', currencySymbol: 'FCFA',
      currencies: [
        { code: 'XOF', symbol: 'FCFA', rate: 1, isDefault: true },
        { code: 'EUR', symbol: '€', rate: 0.0015 },
        { code: 'USD', symbol: '$', rate: 0.0016 },
      ],
      locale: 'fr-FR', language: 'fr', timezone: 'Africa/Ouagadougou',
      taxRate: 18, invoicePrefix: 'FAC-', invoiceNextNumber: 1,
      email: 'contact@neoxshop.com', phone: '+226 70 00 00 00',
      address: 'Ouagadougou, Burkina Faso',
    })
  }

  if ((await db.users.count()) === 0) {
    const pwdHash = await (await import('@/lib/auth')).hashPassword('admin123')
    await db.users.add({
      id: USER, businessId: BIZ, name: 'Administrateur', email: 'admin@neoxerp.com',
      passwordHash: pwdHash, role: 'admin', permissions: ['*'], isActive: true,
      createdAt: new Date().toISOString(),
    })
  }

  if ((await db.accounts.count()) === 0) {
    const now = new Date().toISOString()
    await db.accounts.bulkAdd([
      { id: 'acc-cash', businessId: BIZ, code: '101', name: 'Caisse', type: 'asset', balance: 0, createdAt: now },
      { id: 'acc-bank', businessId: BIZ, code: '102', name: 'Banque', type: 'asset', balance: 0, createdAt: now },
      { id: 'acc-receivable', businessId: BIZ, code: '103', name: 'Clients', type: 'asset', balance: 0, createdAt: now },
      { id: 'acc-inventory', businessId: BIZ, code: '104', name: 'Stock', type: 'asset', balance: 0, createdAt: now },
      { id: 'acc-payable', businessId: BIZ, code: '201', name: 'Fournisseurs', type: 'liability', balance: 0, createdAt: now },
      { id: 'acc-capital', businessId: BIZ, code: '301', name: 'Capital', type: 'equity', balance: 0, createdAt: now },
      { id: 'acc-sales', businessId: BIZ, code: '401', name: 'Ventes', type: 'revenue', balance: 0, createdAt: now },
      { id: 'acc-expense', businessId: BIZ, code: '501', name: 'Dépenses', type: 'expense', balance: 0, createdAt: now },
    ])
  }

  await seedDemoData()
}

async function seedDemoData() {
  const now = new Date().toISOString()
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

  if ((await db.categories.count()) > 0) return

  // ─── CATEGORIES ───
  const cats: Category[] = [
    { id: 'cat-alim', businessId: BIZ, name: 'Alimentation', createdAt: now },
    { id: 'cat-boisson', businessId: BIZ, name: 'Boissons', createdAt: now },
    { id: 'cat-hygiene', businessId: BIZ, name: 'Hygiène & Beauté', createdAt: now },
    { id: 'cat-maison', businessId: BIZ, name: 'Maison & Entretien', createdAt: now },
    { id: 'cat-epicerie', businessId: BIZ, name: 'Épicerie', createdAt: now },
  ]
  await db.categories.bulkAdd(cats)

  // ─── SUPPLIERS ───
  const suppliers: Supplier[] = [
    { id: 'sup-castel', businessId: BIZ, name: 'Castel Burkina', phone: '+226 25 30 30 30', email: 'contact@castel.bf', address: 'Ouagadougou', createdAt: now, updatedAt: now, notes: '' },
    { id: 'sup-nestle', businessId: BIZ, name: 'Nestlé BF', phone: '+226 25 40 40 40', email: 'info@nestle.bf', address: 'Zone Industrielle', createdAt: now, updatedAt: now, notes: '' },
    { id: 'sup-sabc', businessId: BIZ, name: 'SABC', phone: '+226 25 50 50 50', email: 'contact@sabc.bf', address: 'Bobo-Dioulasso', createdAt: now, updatedAt: now, notes: '' },
  ]
  await db.suppliers.bulkAdd(suppliers)

  // ─── PRODUCTS ───
  const products: Product[] = [
    { id: 'p1', businessId: BIZ, name: 'Riz long grain 5kg', barcode: '4901001001', categoryId: 'cat-alim', unit: 'sac', purchasePrice: 2800, sellingPrice: 3500, wholesalePrice: 3200, margin: 25, taxRate: 18, stockAlert: 10, location: 'A1', supplierId: 'sup-sabc', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p2', businessId: BIZ, name: 'Huile végétale 1L', barcode: '4901001002', categoryId: 'cat-alim', unit: 'bouteille', purchasePrice: 1200, sellingPrice: 1500, wholesalePrice: 1400, margin: 25, taxRate: 18, stockAlert: 10, location: 'A2', supplierId: 'sup-castel', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p3', businessId: BIZ, name: 'Lait concentré sucré', barcode: '4901001003', categoryId: 'cat-alim', unit: 'boîte', purchasePrice: 500, sellingPrice: 700, wholesalePrice: 650, margin: 40, taxRate: 18, stockAlert: 20, location: 'A3', supplierId: 'sup-nestle', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p4', businessId: BIZ, name: 'Sucre en poudre 1kg', barcode: '4901001004', categoryId: 'cat-epicerie', unit: 'sac', purchasePrice: 650, sellingPrice: 850, wholesalePrice: 800, margin: 30, taxRate: 18, stockAlert: 15, location: 'B1', supplierId: 'sup-sabc', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p5', businessId: BIZ, name: 'Farine de blé 1kg', barcode: '4901001005', categoryId: 'cat-alim', unit: 'sac', purchasePrice: 400, sellingPrice: 550, wholesalePrice: 500, margin: 37, taxRate: 18, stockAlert: 15, location: 'B2', supplierId: 'sup-sabc', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p6', businessId: BIZ, name: 'Boisson gazeuse 33cl', barcode: '4901001006', categoryId: 'cat-boisson', unit: 'canette', purchasePrice: 200, sellingPrice: 350, wholesalePrice: 300, margin: 75, taxRate: 18, stockAlert: 50, location: 'C1', supplierId: 'sup-castel', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p7', businessId: BIZ, name: 'Eau minérale 1.5L', barcode: '4901001007', categoryId: 'cat-boisson', unit: 'bouteille', purchasePrice: 150, sellingPrice: 250, wholesalePrice: 200, margin: 67, taxRate: 18, stockAlert: 50, location: 'C2', supplierId: 'sup-castel', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p8', businessId: BIZ, name: 'Savon liquide 500ml', barcode: '4901001008', categoryId: 'cat-hygiene', unit: 'flacon', purchasePrice: 600, sellingPrice: 900, wholesalePrice: 800, margin: 50, taxRate: 18, stockAlert: 10, location: 'D1', supplierId: 'sup-nestle', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p9', businessId: BIZ, name: 'Dentifrice 100ml', barcode: '4901001009', categoryId: 'cat-hygiene', unit: 'tube', purchasePrice: 400, sellingPrice: 600, wholesalePrice: 550, margin: 50, taxRate: 18, stockAlert: 20, location: 'D2', supplierId: 'sup-nestle', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p10', businessId: BIZ, name: 'Pâte à tartiner 400g', barcode: '4901001010', categoryId: 'cat-alim', unit: 'pot', purchasePrice: 900, sellingPrice: 1200, wholesalePrice: 1100, margin: 33, taxRate: 18, stockAlert: 8, location: 'A4', supplierId: 'sup-nestle', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p11', businessId: BIZ, name: 'Biscuits assortis 200g', barcode: '4901001011', categoryId: 'cat-epicerie', unit: 'paquet', purchasePrice: 300, sellingPrice: 450, wholesalePrice: 400, margin: 50, taxRate: 18, stockAlert: 20, location: 'B3', supplierId: 'sup-sabc', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p12', businessId: BIZ, name: 'Détergent liquide 1L', barcode: '4901001012', categoryId: 'cat-maison', unit: 'bouteille', purchasePrice: 700, sellingPrice: 1000, wholesalePrice: 950, margin: 43, taxRate: 18, stockAlert: 10, location: 'E1', supplierId: 'sup-nestle', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p13', businessId: BIZ, name: 'Piles AA lot 4', barcode: '4901001013', categoryId: 'cat-maison', unit: 'lot', purchasePrice: 500, sellingPrice: 750, wholesalePrice: 700, margin: 50, taxRate: 18, stockAlert: 10, location: 'E2', supplierId: 'sup-sabc', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p14', businessId: BIZ, name: 'Jus d\'orange 1L', barcode: '4901001014', categoryId: 'cat-boisson', unit: 'brique', purchasePrice: 500, sellingPrice: 700, wholesalePrice: 650, margin: 40, taxRate: 18, stockAlert: 15, location: 'C3', supplierId: 'sup-castel', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p15', businessId: BIZ, name: 'Moutarde 250g', barcode: '4901001015', categoryId: 'cat-epicerie', unit: 'pot', purchasePrice: 300, sellingPrice: 450, wholesalePrice: 400, margin: 50, taxRate: 18, stockAlert: 10, location: 'B4', supplierId: 'sup-nestle', status: 'active', photos: [], createdAt: now, updatedAt: now },
    { id: 'p16', businessId: BIZ, name: 'Beurre de karité 200g', barcode: '4901001016', categoryId: 'cat-hygiene', unit: 'pot', purchasePrice: 800, sellingPrice: 1200, wholesalePrice: 1100, margin: 50, taxRate: 18, stockAlert: 5, location: 'D3', supplierId: 'sup-sabc', status: 'active', photos: [], createdAt: now, updatedAt: now },
  ]
  await db.products.bulkAdd(products)

  // ─── CUSTOMERS ───
  const customers: Customer[] = [
    { id: 'c1', businessId: BIZ, name: 'Aminata Ouédraogo', phone: '+226 70 10 10 10', email: 'aminata.o@gmail.com', address: 'Ouaga 2000', creditLimit: 100000, currentBalance: 35000, notes: 'Bon payeur', createdAt: daysAgo(60), updatedAt: now },
    { id: 'c2', businessId: BIZ, name: 'Mamadou Diallo', phone: '+226 70 20 20 20', email: 'mdiallo@yahoo.fr', address: 'Zone du Bois', creditLimit: 75000, currentBalance: 12000, notes: '', createdAt: daysAgo(45), updatedAt: now },
    { id: 'c3', businessId: BIZ, name: 'Fatoumata Traoré', phone: '+226 70 30 30 30', email: 'ftraore@outlook.com', address: 'Dassasgho', creditLimit: 50000, currentBalance: 50000, notes: 'Nouveau client', createdAt: daysAgo(20), updatedAt: now },
    { id: 'c4', businessId: BIZ, name: 'Souleymane Compaoré', phone: '+226 70 40 40 40', email: '', address: 'Pissy', creditLimit: 150000, currentBalance: 15000, notes: 'Achats réguliers', createdAt: daysAgo(90), updatedAt: now },
    { id: 'c5', businessId: BIZ, name: 'Mariam Sawadogo', phone: '+226 70 50 50 50', email: 'msawadogo@gmail.com', address: 'Tanghin', creditLimit: 30000, currentBalance: 0, notes: '', createdAt: daysAgo(15), updatedAt: now },
  ]
  await db.customers.bulkAdd(customers)

  // ─── EMPLOYEES ───
  const employees: Employee[] = [
    { id: 'emp1', businessId: BIZ, name: 'Issa Koné', phone: '+226 71 11 11 11', email: 'issa.k@neoxshop.com', position: 'Caissier', department: 'Ventes', salary: 150000, salaryType: 'monthly', paymentMethod: 'bank', bankAccount: 'BF1234567890', address: 'Ouagadougou', photo: '', documents: [], hireDate: daysAgo(365), status: 'active', createdAt: daysAgo(365), updatedAt: now },
    { id: 'emp2', businessId: BIZ, name: 'Adama Zongo', phone: '+226 72 22 22 22', email: 'adama.z@neoxshop.com', position: 'Gérant', department: 'Administration', salary: 300000, salaryType: 'monthly', paymentMethod: 'bank', bankAccount: 'BF0987654321', address: 'Ouagadougou', photo: '', documents: [], hireDate: daysAgo(500), status: 'active', createdAt: daysAgo(500), updatedAt: now },
    { id: 'emp3', businessId: BIZ, name: 'Rokia Sanou', phone: '+226 73 33 33 33', email: 'rokia.s@neoxshop.com', position: 'Vendeuse', department: 'Ventes', salary: 120000, salaryType: 'monthly', paymentMethod: 'mobile', bankAccount: '', address: 'Bobo-Dioulasso', photo: '', documents: [], hireDate: daysAgo(180), status: 'active', createdAt: daysAgo(180), updatedAt: now },
  ]
  await db.employees.bulkAdd(employees)

  // ─── LEADS ───
  const leads: Lead[] = [
    { id: 'l1', businessId: BIZ, name: 'Bakary Some', phone: '+226 74 00 00 01', email: 'b.some@gmail.com', company: 'Restaurant Le Zagré', source: 'Bouche-à-oreille', status: 'new', notes: 'Cherche fournisseur régulier', assignedTo: USER, expectedValue: 200000, createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { id: 'l2', businessId: BIZ, name: 'Hawa Bako', phone: '+226 74 00 00 02', email: 'hbako@yahoo.fr', company: 'Épicerie Hawa', source: 'Réseaux sociaux', status: 'contacted', notes: 'A déjà un fournisseur mais pas satisfaite', assignedTo: USER, expectedValue: 150000, createdAt: daysAgo(7), updatedAt: daysAgo(2) },
    { id: 'l3', businessId: BIZ, name: 'Drissa Traoré', phone: '+226 74 00 00 03', email: 'd.traore@outlook.com', company: 'Supermarché Driko', source: 'Site web', status: 'qualified', notes: 'Prêt à signer un contrat', assignedTo: USER, expectedValue: 500000, createdAt: daysAgo(14), updatedAt: daysAgo(1) },
    { id: 'l4', businessId: BIZ, name: 'Salimata Nikiéma', phone: '+226 74 00 00 04', email: '', company: 'Boutique Saly', source: 'Référence', status: 'won', notes: 'Commande test passée avec succès', assignedTo: USER, expectedValue: 100000, createdAt: daysAgo(30), updatedAt: daysAgo(10) },
    { id: 'l5', businessId: BIZ, name: 'Alassane Oumarou', phone: '+226 74 00 00 05', email: 'a.oumarou@gmail.com', company: 'Alimentation Générale', source: 'Appel entrant', status: 'lost', notes: 'Budget insuffisant', assignedTo: USER, expectedValue: 80000, createdAt: daysAgo(60), updatedAt: daysAgo(20) },
  ]
  await db.leads.bulkAdd(leads)

  // ─── CASH BOOK ENTRIES ───
  const cashEntries: CashBookEntry[] = [
    { id: 'cb1', businessId: BIZ, date: daysAgo(1), type: 'in', category: 'Ventes', amount: 125000, description: 'Recettes de la journée', partyName: 'Client divers', paymentMethod: 'cash', reference: 'Caisse journalière', createdAt: daysAgo(1), userId: USER },
    { id: 'cb2', businessId: BIZ, date: daysAgo(2), type: 'out', category: 'Achats', amount: 45000, description: 'Réapprovisionnement riz et huile', partyName: 'SABC', paymentMethod: 'bank', reference: 'Facture SABC-2024-001', createdAt: daysAgo(2), userId: USER },
    { id: 'cb3', businessId: BIZ, date: daysAgo(3), type: 'out', category: 'Loyer', amount: 200000, description: 'Loyer local commercial', partyName: '', paymentMethod: 'bank', reference: 'Quittance mars 2026', createdAt: daysAgo(3), userId: USER },
    { id: 'cb4', businessId: BIZ, date: daysAgo(5), type: 'in', category: 'Ventes', amount: 85000, description: 'Vente au détail', partyName: '', paymentMethod: 'mobile', reference: 'Wave transaction', createdAt: daysAgo(5), userId: USER },
    { id: 'cb5', businessId: BIZ, date: daysAgo(7), type: 'out', category: 'Salaires', amount: 570000, description: 'Salaires mars 2026', partyName: 'Employés', paymentMethod: 'bank', reference: 'Bulletins de paie', createdAt: daysAgo(7), userId: USER },
    { id: 'cb6', businessId: BIZ, date: daysAgo(10), type: 'in', category: 'Ventes', amount: 340000, description: 'Gros client - supermarché', partyName: 'Aminata Ouédraogo', paymentMethod: 'bank', reference: 'Virement', createdAt: daysAgo(10), userId: USER },
    { id: 'cb7', businessId: BIZ, date: daysAgo(14), type: 'out', category: 'Transport', amount: 35000, description: 'Livraison marchandises', partyName: 'Transporteur Moussa', paymentMethod: 'cash', reference: '', createdAt: daysAgo(14), userId: USER },
  ]
  await db.cashBook.bulkAdd(cashEntries)

  // ─── STOCK MOVEMENTS ───
  const stockMovements: StockMovement[] = [
    { id: 'sm1', businessId: BIZ, locationId: 'loc-shop', productId: 'p1', type: 'in', quantity: 100, unitPrice: 2800, reference: 'CMD-001', note: 'Commande initiale', createdAt: daysAgo(30), userId: USER },
    { id: 'sm2', businessId: BIZ, locationId: 'loc-shop', productId: 'p2', type: 'in', quantity: 80, unitPrice: 1200, reference: 'CMD-001', note: '', createdAt: daysAgo(30), userId: USER },
    { id: 'sm3', businessId: BIZ, locationId: 'loc-shop', productId: 'p3', type: 'in', quantity: 50, unitPrice: 500, reference: 'CMD-002', note: '', createdAt: daysAgo(25), userId: USER },
    { id: 'sm4', businessId: BIZ, locationId: 'loc-shop', productId: 'p6', type: 'in', quantity: 200, unitPrice: 200, reference: 'CMD-003', note: 'Boissons', createdAt: daysAgo(20), userId: USER },
    { id: 'sm5', businessId: BIZ, locationId: 'loc-shop', productId: 'p1', type: 'out', quantity: 15, unitPrice: 3500, reference: 'VENTE-001', note: 'Vente à Aminata', createdAt: daysAgo(15), userId: USER },
  ]
  await db.stockMovements.bulkAdd(stockMovements)

  // ─── INITIAL PRODUCT STOCKS ───
  const now2 = new Date().toISOString()
  const initialStocks = products.map(p => ({
    id: `stock-${p.id}-shop`,
    businessId: BIZ,
    productId: p.id,
    locationId: 'loc-shop',
    quantity: 50,
    stockAlert: p.stockAlert || 10,
    stockMin: 0,
    stockMax: 999999,
    updatedAt: now2,
  }))
  await db.productStocks.bulkAdd(initialStocks)

  // ─── CREDITS ───
  const credits: Credit[] = [
    { id: 'cr1', businessId: BIZ, customerId: 'c1', customerName: 'Aminata Ouédraogo', amount: 35000, paid: 20000, balance: 15000, dueDate: daysAgo(-10), status: 'active', reminderSent: [], createdAt: daysAgo(20) },
    { id: 'cr2', businessId: BIZ, customerId: 'c2', customerName: 'Mamadou Diallo', amount: 12000, paid: 0, balance: 12000, dueDate: daysAgo(-5), status: 'overdue', reminderSent: [], createdAt: daysAgo(15) },
    { id: 'cr3', businessId: BIZ, customerId: 'c3', customerName: 'Fatoumata Traoré', amount: 50000, paid: 10000, balance: 40000, dueDate: daysAgo(14), status: 'active', reminderSent: [], createdAt: daysAgo(20) },
    { id: 'cr4', businessId: BIZ, customerId: 'c4', customerName: 'Souleymane Compaoré', amount: 15000, paid: 15000, balance: 0, dueDate: daysAgo(2), status: 'paid', reminderSent: [], createdAt: daysAgo(10) },
  ]
  await db.credits.bulkAdd(credits)

  // ─── NOTIFICATIONS ───
  const notifications: Notification[] = [
    { id: 'n1', businessId: BIZ, type: 'stock_alert', title: 'Stock bas', message: 'Le produit "Riz long grain 5kg" atteint le seuil d\'alerte (10 restants)', read: false, link: '/products', createdAt: daysAgo(1) },
    { id: 'n2', businessId: BIZ, type: 'credit_due', title: 'Paiement en retard', message: 'Mamadou Diallo a un crédit échu de 12 000 FCFA', read: false, link: '/credit', createdAt: daysAgo(2) },
    { id: 'n3', businessId: BIZ, type: 'payment_received', title: 'Paiement reçu', message: 'Souleymane Compaoré a payé 15 000 FCFA', read: true, link: '/payments', createdAt: daysAgo(2) },
    { id: 'n4', businessId: BIZ, type: 'new_sale', title: 'Nouvelle vente', message: 'Vente de 125 000 FCFA enregistrée', read: true, link: '/pos', createdAt: daysAgo(1) },
    { id: 'n5', businessId: BIZ, type: 'invoice_overdue', title: 'Facture impayée', message: 'La facture FAC-00001 est en retard', read: false, link: '/invoices', createdAt: daysAgo(3) },
  ]
  await db.notifications.bulkAdd(notifications)
}

export async function resetDB() {
  await db.delete()
  await initDB()
}

export default db
