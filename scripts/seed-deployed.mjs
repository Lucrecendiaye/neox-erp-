import { chromium } from 'playwright';

const PRODUCTS = [
  ['Lingerie Dentelle Noir', 'LING001', 'Sensualle', 'piece', 5000, 12000, 9000, 18, 5, 'Lingerie'],
  ['Lingerie Dentelle Rouge', 'LING002', 'Sensualle', 'piece', 5000, 12000, 9000, 18, 5, 'Lingerie'],
  ['Cuissard Simili Cuir Noir', 'CUIS001', 'NightGlam', 'piece', 8000, 18000, 14000, 18, 3, 'Cuissards'],
  ['Cuissard Simili Cuir Rouge', 'CUIS002', 'NightGlam', 'piece', 8000, 18000, 14000, 18, 3, 'Cuissards'],
  ['Cuissard Vinyle Noir', 'CUIS003', 'NightGlam', 'piece', 10000, 22000, 17000, 18, 3, 'Cuissards'],
  ['Gaine Ventre Plat Noir', 'GAIN001', 'CorpsParfait', 'piece', 4000, 9500, 7500, 18, 10, 'Gaines'],
  ['Gaine Ventre Plat Beige', 'GAIN002', 'CorpsParfait', 'piece', 4000, 9500, 7500, 18, 10, 'Gaines'],
  ['Gaine Taille Haute Noir', 'GAIN003', 'CorpsParfait', 'piece', 5500, 12000, 9500, 18, 8, 'Gaines'],
  ['Robe Dentelle Noir', 'ROBE001', 'Elegance', 'piece', 7000, 16000, 13000, 18, 4, 'Robes & Bodies'],
  ['Robe Dentelle Rouge', 'ROBE002', 'Elegance', 'piece', 7000, 16000, 13000, 18, 4, 'Robes & Bodies'],
  ['Body Lacé Noir', 'BODY001', 'Sensualle', 'piece', 4500, 10000, 8000, 18, 6, 'Robes & Bodies'],
  ['Body Lacé Rouge', 'BODY002', 'Sensualle', 'piece', 4500, 10000, 8000, 18, 6, 'Robes & Bodies'],
  ['Corset Dentelle Noir', 'CORS01', 'Sensualle', 'piece', 9000, 20000, 16000, 18, 3, 'Robes & Bodies'],
  ['Corset Dentelle Rouge', 'CORS02', 'Sensualle', 'piece', 9000, 20000, 16000, 18, 3, 'Robes & Bodies'],
  ['Guêpière Dentelle Noir', 'GUEP01', 'Sensualle', 'piece', 10000, 22000, 17500, 18, 3, 'Robes & Bodies'],
  ['Porte-Jarretelles Noir', 'PJAR01', 'Sensualle', 'piece', 6000, 14000, 11000, 18, 5, 'Robes & Bodies'],
  ['String Paquet x6 Noir', 'STRP001', 'Intimiss', 'pack', 6000, 14000, 11000, 18, 5, 'Sous-vêtements', 6],
  ['String Paquet x6 Couleurs', 'STRP002', 'Intimiss', 'pack', 6500, 15000, 12000, 18, 5, 'Sous-vêtements', 6],
  ['Bas Résille Lot x6', 'BAS001', 'NightGlam', 'pack', 9000, 21000, 16000, 18, 4, 'Accessoires', 6],
  ['Chaussettes Lot x12 Paire', 'CHAU01', 'Dolce Gambe', 'pack', 5000, 12000, 9000, 18, 6, 'Accessoires', 12],
  ['Paréo Lot x6', 'PARE01', 'PlageElegance', 'pack', 12000, 28000, 22000, 18, 3, 'Plage', 6],
  ['Bikini Lot x12', 'BIKI01', 'PlageElegance', 'dozen', 30000, 66000, 52000, 18, 2, 'Plage'],
  ['Soutien-Gorge Lot x12', 'SGLOT1', 'CorpsParfait', 'dozen', 24000, 54000, 42000, 18, 2, 'Sous-vêtements'],
  ['Collants Lot x12', 'COLOT1', 'Dolce Gambe', 'dozen', 18000, 42000, 33000, 18, 2, 'Accessoires'],
  ['Cache-Sexe Lot x12', 'CACH01', 'Intimiss', 'dozen', 8000, 20000, 15000, 18, 4, 'Sous-vêtements'],
  ['nu-pieds Lot x12', 'NUP001', 'Dolce Gambe', 'dozen', 12000, 30000, 24000, 18, 3, 'Accessoires'],
  ['Éponge Lot x12', 'EPON01', 'Douceur', 'dozen', 7000, 18000, 14000, 18, 5, 'Accessoires'],
  ['Pyjama Soie Noir', 'PYJA01', 'NuitDouce', 'piece', 11000, 25000, 20000, 18, 3, 'Nuit'],
  ['Pyjama Soie Rose', 'PYJA02', 'NuitDouce', 'piece', 11000, 25000, 20000, 18, 3, 'Nuit'],
  ['Peignoir Soie Noir', 'PEIG01', 'NuitDouce', 'piece', 13000, 28000, 22000, 18, 2, 'Nuit'],
];
const CAT_NAMES = ['Lingerie', 'Cuissards', 'Gaines', 'Robes & Bodies', 'Sous-vêtements', 'Accessoires', 'Nuit', 'Plage'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));

  // Register via UI
  await page.goto('https://neox-erp-alpha.vercel.app/register', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));

  for (let i = 0; i < 3; i++) {
    const hasErr = await page.evaluate(() => document.body.innerText.includes('Erreur'));
    if (hasErr) {
      const btn = page.locator('button:has-text("Réessayer")');
      if (await btn.isVisible().catch(() => false)) { await btn.click(); await new Promise(r => setTimeout(r, 3000)); }
      else break;
    } else break;
  }

  await page.locator('[placeholder="Votre nom"]').fill('Admin Boutique');
  await page.locator('[placeholder="email@exemple.com"]').fill('admin@boutique.com');
  await page.locator('[placeholder="+226 XX XX XX"]').fill('+22670123456');
  const pwds = page.locator('[placeholder="••••••••"]');
  await pwds.nth(0).fill('admin123');
  await pwds.nth(1).fill('admin123');
  await page.locator('button:has-text("Créer mon compte")').click();
  await new Promise(r => setTimeout(r, 5000));

  const dbInfo = await page.evaluate(() => new Promise(resolve => {
    const r = indexedDB.open('neox_erp');
    r.onsuccess = () => {
      const db = r.result;
      const results = {};
      const tx = db.transaction(['businesses', 'locations', 'users'], 'readonly');
      tx.objectStore('businesses').getAll().onsuccess = e => results.biz = e.target.result[0];
      tx.objectStore('locations').getAll().onsuccess = e => results.locs = e.target.result;
      tx.objectStore('users').getAll().onsuccess = e => { results.user = e.target.result[0]; resolve(results); };
    };
    r.onerror = () => resolve(null);
  }));

  if (!dbInfo?.biz) { console.log('Registration failed'); await browser.close(); return; }

  const { biz, locs, user } = dbInfo;
  console.log('Registered business:', biz.id, 'user:', user.id);
  console.log('Seeding products via Dexie (CDN)...');

  // Use Dexie from CDN to properly seed via its API
  const result = await page.evaluate(async ({ PRODUCTS, CAT_NAMES, businessId, userId, locs }) => {
    const Dexie = (await import('https://unpkg.com/dexie@4.4.4/dist/dexie.mjs')).default;
    const db = new Dexie('neox_erp');
    db.version(4).stores({
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
    });
    await db.open();

    function genId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    const now = new Date().toISOString();
    const shopLoc = locs.find(l => l.type === 'shop');
    const warehouseLoc = locs.find(l => l.type === 'warehouse');
    const catMap = {};

    for (const name of CAT_NAMES) {
      const id = genId(); catMap[name] = id;
      await db.categories.add({ id, businessId, name, parentId: '', createdAt: now });
    }

    for (const p of PRODUCTS) {
      const [name, barcode, brand, unit, purchasePrice, sellingPrice, wholesalePrice, taxRate, stockAlert, cat, packSize] = p;
      const prodId = genId();
      const margin = ((sellingPrice - purchasePrice) / purchasePrice) * 100;
      await db.products.add({
        id: prodId, businessId, name, description: '', barcode, reference: barcode,
        categoryId: catMap[cat] || '', brand, unit, purchasePrice, sellingPrice, wholesalePrice,
        priceDozen: 0, pricePack: 0, packSize: unit === 'pack' ? (packSize || 6) : undefined,
        taxRate, stockAlert, location: '', photos: [], margin, status: 'active',
        createdAt: now, updatedAt: now,
      });

      const q1 = Math.floor(Math.random() * 10) + 5;
      await db.productStocks.add({ id: genId(), businessId, productId: prodId, locationId: shopLoc.id, quantity: q1, stockAlert, stockMin: 0, stockMax: 0, updatedAt: now });
      await db.stockMovements.add({ id: genId(), businessId, locationId: shopLoc.id, productId: prodId, type: 'in', quantity: q1, unitPrice: purchasePrice, reference: 'INIT', note: 'Stock initial boutique', createdAt: now, userId });

      const q2 = Math.floor(Math.random() * 20) + 10;
      await db.productStocks.add({ id: genId(), businessId, productId: prodId, locationId: warehouseLoc.id, quantity: q2, stockAlert, stockMin: 0, stockMax: 0, updatedAt: now });
      await db.stockMovements.add({ id: genId(), businessId, locationId: warehouseLoc.id, productId: prodId, type: 'in', quantity: q2, unitPrice: purchasePrice, reference: 'INIT', note: 'Stock initial d\u00e9p\u00f4t', createdAt: now, userId });
    }

    return {
      products: await db.products.count(),
      categories: await db.categories.count(),
      stocks: await db.productStocks.count(),
      movements: await db.stockMovements.count(),
    };
  }, { PRODUCTS, CAT_NAMES, businessId: biz.id, userId: user.id, locs });

  console.log('Seed result:', JSON.stringify(result));
  if (!result || result.products === 0) {
    console.log('Seed failed!');
    await browser.close();
    return;
  }

  // Reload to verify data persists
  await page.reload({ waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 4000));

  // Navigate to products page
  await page.goto('https://neox-erp-alpha.vercel.app/products', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));

  const visibleText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('Products page:', visibleText.substring(0, 500));

  await page.screenshot({ path: 'screenshots/deployed-seed.png' });
  console.log('Screenshot saved');

  await browser.close();
  console.log('\n Seed complete for deployed site!');
  console.log(' URL: https://neox-erp-alpha.vercel.app');
  console.log(' Email: admin@boutique.com / admin123');
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
