import { chromium } from 'playwright';
import os from 'os';
import path from 'path';

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
  const tmpDir = path.join(os.tmpdir(), 'neox-seed-' + Date.now());
  const context = await chromium.launchPersistentContext(tmpDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = context.pages()[0] || await context.newPage();

  // Step 1: Register account via the actual form
  console.log('1. Inscription...');
  await page.goto('https://neox-erp-alpha.vercel.app/register', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  // Handle error screen if present
  for (let i = 0; i < 3; i++) {
    const err = await page.locator('button:has-text("Réessayer")').isVisible().catch(() => false);
    if (err) { await page.locator('button:has-text("Réessayer")').click(); await new Promise(r => setTimeout(r, 3000)); }
    else break;
  }

  // Fill registration form
  await page.locator('[placeholder="Votre nom"]').fill('Admin Boutique');
  await page.locator('[placeholder="email@exemple.com"]').fill('admin@boutique.com');
  await page.locator('[placeholder="+226 XX XX XX"]').fill('+22670123456');
  const pwdFields = page.locator('[placeholder="••••••••"]');
  await pwdFields.nth(0).fill('admin123');
  await pwdFields.nth(1).fill('admin123');
  await page.locator('button:has-text("Créer mon compte")').click();
  await new Promise(r => setTimeout(r, 5000));

  const afterRegUrl = page.url();
  console.log('After registration URL:', afterRegUrl);

  // Step 2: Get business info
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
  }));

  if (!dbInfo.biz || !dbInfo.user) {
    console.log('Registration failed. Trying alternate login method...');
    // Maybe already registered? Let's check login page
    await page.goto('https://neox-erp-alpha.vercel.app/login', { waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 3000));

    // Fill login
    await page.locator('[placeholder="exemple@email.com"]').fill('admin@boutique.com');
    await page.locator('[placeholder="••••••••"]').fill('admin123');
    await page.locator('button:has-text("Se connecter")').click();
    await new Promise(r => setTimeout(r, 4000));
    console.log('Login URL:', page.url());

    // Check if logged in
    const dbInfo2 = await page.evaluate(() => new Promise(resolve => {
      const r = indexedDB.open('neox_erp');
      r.onsuccess = () => {
        const db = r.result;
        const results = {};
        const tx = db.transaction(['businesses', 'locations', 'users'], 'readonly');
        tx.objectStore('businesses').getAll().onsuccess = e => results.biz = e.target.result;
        tx.objectStore('locations').getAll().onsuccess = e => results.locs = e.target.result;
        tx.objectStore('users').getAll().onsuccess = e => { results.user = e.target.result; resolve(results); };
      };
    }));
    console.log('DB after login attempt:', JSON.stringify(dbInfo2).substring(0, 300));
    return;
  }

  const { biz: business, locs: locations, user } = dbInfo;
  const businessId = business.id;
  const userId = user.id;
  const shopLoc = locations.find(l => l.type === 'shop');
  const warehouseLoc = locations.find(l => l.type === 'warehouse');
  console.log(`Business: ${businessId}, User: ${userId}`);
  console.log(`Shop: ${shopLoc.id}, Warehouse: ${warehouseLoc.id}`);

  // Step 3: Seed products via Dexie API (the app is loaded, so we can use the db)
  console.log('2. Creating products via Dexie...');
  const result = await page.evaluate(async ({ PRODUCTS, CAT_NAMES, businessId, userId, shopLocId, warehouseLocId }) => {
    // Import the Dexie db instance from the app
    const db = (await import('/src/db')).default;
    const genId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c=='x'?r:(r&0x3|0x8)).toString(16) });
    const now = new Date().toISOString();
    const catMap = {};

    // Create categories
    for (const name of CAT_NAMES) {
      const id = genId();
      catMap[name] = id;
      await db.categories.add({ id, businessId, name, parentId: '', createdAt: now });
    }

    // Create products
    for (const p of PRODUCTS) {
      const [name, barcode, brand, unit, purchasePrice, sellingPrice, wholesalePrice, taxRate, stockAlert, cat, packSize] = p;
      const prodId = genId();
      const margin = ((sellingPrice - purchasePrice) / purchasePrice) * 100;
      await db.products.add({ id: prodId, businessId, name, description: '', barcode, reference: barcode, categoryId: catMap[cat] || '', brand, unit, purchasePrice, sellingPrice, wholesalePrice, priceDozen: 0, pricePack: 0, packSize: unit === 'pack' ? (packSize || 6) : undefined, taxRate, stockAlert, location: '', photos: [], margin, status: 'active', createdAt: now, updatedAt: now });

      const q1 = Math.floor(Math.random() * 10) + 5;
      await db.productStocks.add({ id: genId(), businessId, productId: prodId, locationId: shopLocId, quantity: q1, stockAlert, stockMin: 0, stockMax: 0, updatedAt: now });
      await db.stockMovements.add({ id: genId(), businessId, locationId: shopLocId, productId: prodId, type: 'in', quantity: q1, unitPrice: purchasePrice, reference: 'INIT', note: 'Stock initial boutique', createdAt: now, userId });

      const q2 = Math.floor(Math.random() * 20) + 10;
      await db.productStocks.add({ id: genId(), businessId, productId: prodId, locationId: warehouseLocId, quantity: q2, stockAlert, stockMin: 0, stockMax: 0, updatedAt: now });
      await db.stockMovements.add({ id: genId(), businessId, locationId: warehouseLocId, productId: prodId, type: 'in', quantity: q2, unitPrice: purchasePrice, reference: 'INIT', note: 'Stock initial dépôt', createdAt: now, userId });
    }

    const counts = { products: await db.products.count(), categories: await db.categories.count(), stocks: await db.productStocks.count(), movements: await db.stockMovements.count() };
    return counts;
  }, { PRODUCTS, CAT_NAMES, businessId, userId, shopLocId: shopLoc.id, warehouseLocId: warehouseLoc.id });

  console.log('Created:', JSON.stringify(result));

  // Step 4: Verify by navigating to dashboard
  await page.goto('https://neox-erp-alpha.vercel.app/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 4000));
  console.log('Dashboard URL:', page.url());
  const dashText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Dashboard:', dashText);

  await context.close();
  console.log('\n========================================');
  console.log('✅ COMPTE PRÊT !');
  console.log('========================================');
  console.log('🌍 https://neox-erp-alpha.vercel.app');
  console.log('📧 admin@boutique.com');
  console.log('🔑 admin123');
  console.log('========================================');
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
