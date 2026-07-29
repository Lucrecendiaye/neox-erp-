import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

const CATEGORIES = ['Lingerie', 'Cuissards', 'Gaines', 'Robes & Bodies', 'Sous-vêtements', 'Accessoires', 'Nuit', 'Plage'];

const PRODUCTS = [
  { name: 'Lingerie Dentelle Noir', barcode: 'LING001', brand: 'Sensualle', unit: 'piece', purchasePrice: 5000, sellingPrice: 12000, wholesalePrice: 9000, taxRate: 18, stockAlert: 5, cat: 'Lingerie' },
  { name: 'Lingerie Dentelle Rouge', barcode: 'LING002', brand: 'Sensualle', unit: 'piece', purchasePrice: 5000, sellingPrice: 12000, wholesalePrice: 9000, taxRate: 18, stockAlert: 5, cat: 'Lingerie' },
  { name: 'Cuissard Simili Cuir Noir', barcode: 'CUIS001', brand: 'NightGlam', unit: 'piece', purchasePrice: 8000, sellingPrice: 18000, wholesalePrice: 14000, taxRate: 18, stockAlert: 3, cat: 'Cuissards' },
  { name: 'Cuissard Simili Cuir Rouge', barcode: 'CUIS002', brand: 'NightGlam', unit: 'piece', purchasePrice: 8000, sellingPrice: 18000, wholesalePrice: 14000, taxRate: 18, stockAlert: 3, cat: 'Cuissards' },
  { name: 'Cuissard Vinyle Noir', barcode: 'CUIS003', brand: 'NightGlam', unit: 'piece', purchasePrice: 10000, sellingPrice: 22000, wholesalePrice: 17000, taxRate: 18, stockAlert: 3, cat: 'Cuissards' },
  { name: 'Gaine Ventre Plat Noir', barcode: 'GAIN001', brand: 'CorpsParfait', unit: 'piece', purchasePrice: 4000, sellingPrice: 9500, wholesalePrice: 7500, taxRate: 18, stockAlert: 10, cat: 'Gaines' },
  { name: 'Gaine Ventre Plat Beige', barcode: 'GAIN002', brand: 'CorpsParfait', unit: 'piece', purchasePrice: 4000, sellingPrice: 9500, wholesalePrice: 7500, taxRate: 18, stockAlert: 10, cat: 'Gaines' },
  { name: 'Gaine Taille Haute Noir', barcode: 'GAIN003', brand: 'CorpsParfait', unit: 'piece', purchasePrice: 5500, sellingPrice: 12000, wholesalePrice: 9500, taxRate: 18, stockAlert: 8, cat: 'Gaines' },
  { name: 'Robe Dentelle Noir', barcode: 'ROBE001', brand: 'Elegance', unit: 'piece', purchasePrice: 7000, sellingPrice: 16000, wholesalePrice: 13000, taxRate: 18, stockAlert: 4, cat: 'Robes & Bodies' },
  { name: 'Robe Dentelle Rouge', barcode: 'ROBE002', brand: 'Elegance', unit: 'piece', purchasePrice: 7000, sellingPrice: 16000, wholesalePrice: 13000, taxRate: 18, stockAlert: 4, cat: 'Robes & Bodies' },
  { name: 'Body Lacé Noir', barcode: 'BODY001', brand: 'Sensualle', unit: 'piece', purchasePrice: 4500, sellingPrice: 10000, wholesalePrice: 8000, taxRate: 18, stockAlert: 6, cat: 'Robes & Bodies' },
  { name: 'Body Lacé Rouge', barcode: 'BODY002', brand: 'Sensualle', unit: 'piece', purchasePrice: 4500, sellingPrice: 10000, wholesalePrice: 8000, taxRate: 18, stockAlert: 6, cat: 'Robes & Bodies' },
  { name: 'Corset Dentelle Noir', barcode: 'CORS01', brand: 'Sensualle', unit: 'piece', purchasePrice: 9000, sellingPrice: 20000, wholesalePrice: 16000, taxRate: 18, stockAlert: 3, cat: 'Robes & Bodies' },
  { name: 'Corset Dentelle Rouge', barcode: 'CORS02', brand: 'Sensualle', unit: 'piece', purchasePrice: 9000, sellingPrice: 20000, wholesalePrice: 16000, taxRate: 18, stockAlert: 3, cat: 'Robes & Bodies' },
  { name: 'Guêpière Dentelle Noir', barcode: 'GUEP01', brand: 'Sensualle', unit: 'piece', purchasePrice: 10000, sellingPrice: 22000, wholesalePrice: 17500, taxRate: 18, stockAlert: 3, cat: 'Robes & Bodies' },
  { name: 'Porte-Jarretelles Noir', barcode: 'PJAR01', brand: 'Sensualle', unit: 'piece', purchasePrice: 6000, sellingPrice: 14000, wholesalePrice: 11000, taxRate: 18, stockAlert: 5, cat: 'Robes & Bodies' },
  { name: 'String Paquet x6 Noir', barcode: 'STRP001', brand: 'Intimiss', unit: 'pack', purchasePrice: 6000, sellingPrice: 14000, wholesalePrice: 11000, taxRate: 18, stockAlert: 5, packSize: 6, cat: 'Sous-vêtements' },
  { name: 'String Paquet x6 Couleurs', barcode: 'STRP002', brand: 'Intimiss', unit: 'pack', purchasePrice: 6500, sellingPrice: 15000, wholesalePrice: 12000, taxRate: 18, stockAlert: 5, packSize: 6, cat: 'Sous-vêtements' },
  { name: 'Bas Résille Lot x6', barcode: 'BAS001', brand: 'NightGlam', unit: 'pack', purchasePrice: 9000, sellingPrice: 21000, wholesalePrice: 16000, taxRate: 18, stockAlert: 4, packSize: 6, cat: 'Accessoires' },
  { name: 'Chaussettes Lot x12 Paire', barcode: 'CHAU01', brand: 'Dolce Gambe', unit: 'pack', purchasePrice: 5000, sellingPrice: 12000, wholesalePrice: 9000, taxRate: 18, stockAlert: 6, packSize: 12, cat: 'Accessoires' },
  { name: 'Paréo Lot x6', barcode: 'PARE01', brand: 'PlageElegance', unit: 'pack', purchasePrice: 12000, sellingPrice: 28000, wholesalePrice: 22000, taxRate: 18, stockAlert: 3, packSize: 6, cat: 'Plage' },
  { name: 'Bikini Lot x12', barcode: 'BIKI01', brand: 'PlageElegance', unit: 'dozen', purchasePrice: 30000, sellingPrice: 66000, wholesalePrice: 52000, taxRate: 18, stockAlert: 2, cat: 'Plage' },
  { name: 'Soutien-Gorge Lot x12', barcode: 'SGLOT1', brand: 'CorpsParfait', unit: 'dozen', purchasePrice: 24000, sellingPrice: 54000, wholesalePrice: 42000, taxRate: 18, stockAlert: 2, cat: 'Sous-vêtements' },
  { name: 'Collants Lot x12', barcode: 'COLOT1', brand: 'Dolce Gambe', unit: 'dozen', purchasePrice: 18000, sellingPrice: 42000, wholesalePrice: 33000, taxRate: 18, stockAlert: 2, cat: 'Accessoires' },
  { name: 'Cache-Sexe Lot x12', barcode: 'CACH01', brand: 'Intimiss', unit: 'dozen', purchasePrice: 8000, sellingPrice: 20000, wholesalePrice: 15000, taxRate: 18, stockAlert: 4, cat: 'Sous-vêtements' },
  { name: 'nu-pieds Lot x12', barcode: 'NUP001', brand: 'Dolce Gambe', unit: 'dozen', purchasePrice: 12000, sellingPrice: 30000, wholesalePrice: 24000, taxRate: 18, stockAlert: 3, cat: 'Accessoires' },
  { name: 'Éponge Lot x12', barcode: 'EPON01', brand: 'Douceur', unit: 'dozen', purchasePrice: 7000, sellingPrice: 18000, wholesalePrice: 14000, taxRate: 18, stockAlert: 5, cat: 'Accessoires' },
  { name: 'Pyjama Soie Noir', barcode: 'PYJA01', brand: 'NuitDouce', unit: 'piece', purchasePrice: 11000, sellingPrice: 25000, wholesalePrice: 20000, taxRate: 18, stockAlert: 3, cat: 'Nuit' },
  { name: 'Pyjama Soie Rose', barcode: 'PYJA02', brand: 'NuitDouce', unit: 'piece', purchasePrice: 11000, sellingPrice: 25000, wholesalePrice: 20000, taxRate: 18, stockAlert: 3, cat: 'Nuit' },
  { name: 'Peignoir Soie Noir', barcode: 'PEIG01', brand: 'NuitDouce', unit: 'piece', purchasePrice: 13000, sellingPrice: 28000, wholesalePrice: 22000, taxRate: 18, stockAlert: 2, cat: 'Nuit' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Registering account...');
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await sleep(2000);

  await page.locator('[placeholder="Votre nom"]').fill('Admin Boutique');
  await page.locator('[placeholder="email@exemple.com"]').fill('admin@boutique.com');
  await page.locator('[placeholder="+226 XX XX XX"]').fill('+22670123456');
  const pwdFields = page.locator('[placeholder="••••••••"]');
  await pwdFields.nth(0).fill('admin123');
  await pwdFields.nth(1).fill('admin123');
  await page.locator('button:has-text("Créer mon compte")').click();
  await sleep(4000);

  console.log('Registered. URL:', page.url());

  // Get business info from IndexedDB
  const dbInfo = await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('neox_erp');
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(['businesses', 'locations', 'users'], 'readonly');
      const results = {};
      tx.objectStore('businesses').getAll().onsuccess = e => results.biz = e.target.result[0];
      tx.objectStore('locations').getAll().onsuccess = e => results.locs = e.target.result;
      tx.objectStore('users').getAll().onsuccess = e => { results.user = e.target.result[0]; resolve(results); };
    };
  }));
  const { biz: business, locs: locations, user } = dbInfo;
  const businessId = business.id;
  const userId = user.id;
  const shopLoc = locations.find(l => l.type === 'shop');
  const warehouseLoc = locations.find(l => l.type === 'warehouse');
  console.log(`Business: ${businessId}, User: ${userId}`);
  console.log(`Shop: ${shopLoc.id}, Warehouse: ${warehouseLoc.id}`);

  console.log('2. Creating categories and products via IndexedDB...');
  const result = await page.evaluate(async ({ CATEGORIES, PRODUCTS, businessId, shopLocId, warehouseLocId, userId }) => {
    const genId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c=='x'?r:(r&0x3|0x8)).toString(16) });
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const now = new Date().toISOString();
    const catMap = {};

    return new Promise((resolve) => {
      const r = indexedDB.open('neox_erp');
      r.onsuccess = () => {
        const db = r.result;

        // Categories
        const catTx = db.transaction('categories', 'readwrite');
        const catStore = catTx.objectStore('categories');
        CATEGORIES.forEach(name => {
          const id = genId();
          catMap[name] = id;
          catStore.add({ id, businessId, name, parentId: '', createdAt: now });
        });

        catTx.oncomplete = () => {
          // Products + stocks + movements in one transaction
          const tx = db.transaction(['products', 'productStocks', 'stockMovements'], 'readwrite');
          const prodStore = tx.objectStore('products');
          const stkStore = tx.objectStore('productStocks');
          const movStore = tx.objectStore('stockMovements');

          PRODUCTS.forEach(p => {
            const prodId = genId();
            const margin = ((p.sellingPrice - p.purchasePrice) / p.purchasePrice) * 100;
            const packSize = p.unit === 'pack' ? (p.packSize || 6) : undefined;

            prodStore.add({
              id: prodId, businessId, name: p.name, description: '',
              barcode: p.barcode, reference: p.barcode, categoryId: catMap[p.cat] || '',
              brand: p.brand, unit: p.unit, purchasePrice: p.purchasePrice,
              sellingPrice: p.sellingPrice, wholesalePrice: p.wholesalePrice || 0,
              priceDozen: 0, pricePack: 0, packSize,
              taxRate: p.taxRate, stockAlert: p.stockAlert || 5,
              location: '', photos: [], margin, status: 'active',
              createdAt: now, updatedAt: now,
            });

            // Shop stock
            const q1 = rnd(5, 15);
            stkStore.add({ id: genId(), businessId, productId: prodId, locationId: shopLocId, quantity: q1, stockAlert: p.stockAlert || 5, stockMin: 0, stockMax: 0, updatedAt: now });
            movStore.add({ id: genId(), businessId, locationId: shopLocId, productId: prodId, type: 'in', quantity: q1, unitPrice: p.purchasePrice, reference: 'INIT', note: 'Stock initial boutique', createdAt: now, userId });

            // Warehouse stock
            const q2 = rnd(10, 30);
            stkStore.add({ id: genId(), businessId, productId: prodId, locationId: warehouseLocId, quantity: q2, stockAlert: p.stockAlert || 5, stockMin: 0, stockMax: 0, updatedAt: now });
            movStore.add({ id: genId(), businessId, locationId: warehouseLocId, productId: prodId, type: 'in', quantity: q2, unitPrice: p.purchasePrice, reference: 'INIT', note: 'Stock initial dépôt', createdAt: now, userId });
          });

          tx.oncomplete = () => resolve('ok');
          tx.onerror = (e) => resolve('error: ' + e.target.error);
        };
        catTx.onerror = (e) => resolve('cat error: ' + e.target.error);
      };
      r.onerror = () => resolve('db open error');
    });
  }, {
    CATEGORIES: CATEGORIES,
    PRODUCTS: PRODUCTS,
    businessId: businessId,
    shopLocId: shopLoc.id,
    warehouseLocId: warehouseLoc.id,
    userId: userId,
  });
  console.log('Seed result:', result);

  // Verify
  const counts = await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('neox_erp');
    r.onsuccess = () => {
      const db = r.result;
      let p, c, s, m;
      const tx = db.transaction(['products', 'categories', 'productStocks', 'stockMovements'], 'readonly');
      tx.objectStore('products').count().onsuccess = e => p = e.target.result;
      tx.objectStore('categories').count().onsuccess = e => c = e.target.result;
      tx.objectStore('productStocks').count().onsuccess = e => s = e.target.result;
      tx.objectStore('stockMovements').count().onsuccess = e => { m = e.target.result; resolve({ products: p, categories: c, stocks: s, movements: m }); };
    };
  }));
  console.log('DB state:', counts);

  await browser.close();
  console.log('\n========================================');
  console.log('✅ Compte créé et base de données initialisée !');
  console.log('========================================');
  console.log('Email:    admin@boutique.com');
  console.log('Mot de passe: admin123');
  console.log('Produits créés: 30');
  console.log('Catégories: 8');
  console.log('Emplacements: Boutique + Dépôt Principal');
  console.log('========================================');
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
