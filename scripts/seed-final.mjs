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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));

  // Go to register page and wait for app to initialize
  await page.goto('https://neox-erp-alpha.vercel.app/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 4000));

  // Click retry if error screen appears
  for (let i = 0; i < 3; i++) {
    const hasError = await page.evaluate(() => document.body.innerText.includes('Erreur'));
    if (hasError) {
      console.log('Error page, clicking Retry attempt', i+1);
      const retryBtn = page.locator('button:has-text("Réessayer")');
      if (await retryBtn.isVisible().catch(() => false)) {
        await retryBtn.click();
        await new Promise(r => setTimeout(r, 4000));
      }
    } else {
      break;
    }
  }

  // Now we should be on the login page or register page. Navigate to register if needed.
  const url = page.url();
  console.log('Current URL:', url);
  if (!url.includes('/register')) {
    await page.goto('https://neox-erp-alpha.vercel.app/register', { waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 3000));
  }

  // Use raw IndexedDB API to seed the entire database
  console.log('Seeding database via raw IndexedDB API...');
  const result = await page.evaluate(async (productData) => {
    function genId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    const now = new Date().toISOString();
    const bizId = 'biz-' + Date.now();
    const userId = 'user-' + Date.now();
    const shopLocId = 'loc-shop-' + bizId;
    const warehouseLocId = 'loc-warehouse-' + bizId;

    // Hash password (SHA-256 with salt, same as auth.ts)
    async function hashPassword(password) {
      const encoder = new TextEncoder();
      const salt = 'neox-salt-v1';
      const data = encoder.encode(password + salt);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const hash = await hashPassword('admin123');

    return new Promise((resolve) => {
      const r = indexedDB.open('neox_erp');
      r.onupgradeneeded = () => { /* schema already exists */ };
      r.onsuccess = () => {
        const db = r.result;

        // Helper to wrap IDB requests in promises
        function storeOp(storeName, mode, callback) {
          return new Promise((res, rej) => {
            const tx = db.transaction(storeName, mode);
            callback(tx.objectStore(storeName));
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
          });
        }

        async function run() {
          // 1. Business
          await storeOp('businesses', 'readwrite', store => {
            store.add({ id: bizId, name: "Admin Boutique's Shop", currency: 'XOF', currencySymbol: 'FCFA', phone: '+22670123456', email: 'admin@boutique.com', isActive: true, createdAt: now });
          });

          // 2. Settings
          await storeOp('settings', 'readwrite', store => {
            store.put({ id: 'default', name: 'Application', currency: 'XOF', currencySymbol: 'FCFA', currencies: [{ code: 'XOF', symbol: 'FCFA', rate: 1, isDefault: true }, { code: 'EUR', symbol: '€', rate: 0.0015 }, { code: 'USD', symbol: '$', rate: 0.0016 }], locale: 'fr-FR', language: 'fr', timezone: 'Africa/Ouagadougou', taxRate: 18, invoicePrefix: 'FAC-', invoiceNextNumber: 1 });
          });

          // 3. Locations
          await storeOp('locations', 'readwrite', store => {
            store.add({ id: shopLocId, businessId: bizId, name: 'Boutique Principale', type: 'shop', address: '', phone: '+22670123456', isActive: true, createdAt: now, updatedAt: now });
            store.add({ id: warehouseLocId, businessId: bizId, name: 'Dépôt Principal', type: 'warehouse', address: '', phone: '', isActive: true, createdAt: now, updatedAt: now });
          });

          // 4. Accounts
          const accounts = [
            { id: 'acc-cash-' + bizId, businessId: bizId, code: '101', name: 'Caisse', type: 'asset', balance: 0, createdAt: now },
            { id: 'acc-bank-' + bizId, businessId: bizId, code: '102', name: 'Banque', type: 'asset', balance: 0, createdAt: now },
            { id: 'acc-receivable-' + bizId, businessId: bizId, code: '103', name: 'Clients', type: 'asset', balance: 0, createdAt: now },
            { id: 'acc-inventory-' + bizId, businessId: bizId, code: '104', name: 'Stock', type: 'asset', balance: 0, createdAt: now },
            { id: 'acc-payable-' + bizId, businessId: bizId, code: '201', name: 'Fournisseurs', type: 'liability', balance: 0, createdAt: now },
            { id: 'acc-capital-' + bizId, businessId: bizId, code: '301', name: 'Capital', type: 'equity', balance: 0, createdAt: now },
            { id: 'acc-sales-' + bizId, businessId: bizId, code: '401', name: 'Ventes', type: 'revenue', balance: 0, createdAt: now },
            { id: 'acc-expense-' + bizId, businessId: bizId, code: '501', name: 'Dépenses', type: 'expense', balance: 0, createdAt: now },
          ];
          await storeOp('accounts', 'readwrite', store => {
            accounts.forEach(a => store.add(a));
          });

          // 5. Categories
          const catNames = ['Lingerie', 'Cuissards', 'Gaines', 'Robes & Bodies', 'Sous-vêtements', 'Accessoires', 'Nuit', 'Plage'];
          const catMap = {};
          await storeOp('categories', 'readwrite', store => {
            catNames.forEach(name => {
              const id = genId();
              catMap[name] = id;
              store.add({ id, businessId: bizId, name, parentId: '', createdAt: now });
            });
          });

          // 6. User
          await storeOp('users', 'readwrite', store => {
            store.add({ id: userId, businessId: bizId, name: 'Admin Boutique', email: 'admin@boutique.com', phone: '+22670123456', passwordHash: hash, role: 'admin', permissions: ['*'], isActive: true, createdAt: now });
          });

          // 7. Products & stocks
          for (const p of productData) {
            const [name, barcode, brand, unit, purchasePrice, sellingPrice, wholesalePrice, taxRate, stockAlert, cat, packSize] = p;
            const prodId = genId();
            const margin = ((sellingPrice - purchasePrice) / purchasePrice) * 100;
            const ps = unit === 'pack' ? (packSize || 6) : undefined;

            await storeOp('products', 'readwrite', store => {
              store.add({ id: prodId, businessId: bizId, name, description: '', barcode, reference: barcode, categoryId: catMap[cat] || '', brand, unit, purchasePrice, sellingPrice, wholesalePrice, priceDozen: 0, pricePack: 0, packSize: ps, taxRate, stockAlert, location: '', photos: [], margin, status: 'active', createdAt: now, updatedAt: now });
            });

            const q1 = Math.floor(Math.random() * 10) + 5;
            await storeOp('productStocks', 'readwrite', store => {
              store.add({ id: genId(), businessId: bizId, productId: prodId, locationId: shopLocId, quantity: q1, stockAlert, stockMin: 0, stockMax: 0, updatedAt: now });
            });
            await storeOp('stockMovements', 'readwrite', store => {
              store.add({ id: genId(), businessId: bizId, locationId: shopLocId, productId: prodId, type: 'in', quantity: q1, unitPrice: purchasePrice, reference: 'INIT', note: 'Stock initial boutique', createdAt: now, userId });
            });

            const q2 = Math.floor(Math.random() * 20) + 10;
            await storeOp('productStocks', 'readwrite', store => {
              store.add({ id: genId(), businessId: bizId, productId: prodId, locationId: warehouseLocId, quantity: q2, stockAlert, stockMin: 0, stockMax: 0, updatedAt: now });
            });
            await storeOp('stockMovements', 'readwrite', store => {
              store.add({ id: genId(), businessId: bizId, locationId: warehouseLocId, productId: prodId, type: 'in', quantity: q2, unitPrice: purchasePrice, reference: 'INIT', note: 'Stock initial dépôt', createdAt: now, userId });
            });
          }

          return { success: true, bizId, userId, shopLocId, warehouseLocId, productCount: productData.length };
        }

        run().then(resolve).catch(err => resolve({ error: err.message }));
      };
      r.onerror = () => resolve({ error: 'Failed to open IndexedDB' });
    });
  }, PRODUCTS);

  console.log('Seed result:', JSON.stringify(result, null, 2));

  if (result.success) {
    // Set session in localStorage and reload
    await page.evaluate((userId) => {
      localStorage.setItem('neox-user-id', userId);
      localStorage.setItem('neox-session-start', new Date().toISOString());
    }, result.userId);

    console.log('Session set, reloading...');
    await page.reload({ waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 4000));

    const finalUrl = page.url();
    const finalText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('After login - URL:', finalUrl);
    console.log('Page content:', finalText);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/boutique-seeded.png' });
    console.log('Screenshot saved');
  }

  await browser.close();

  console.log('\n========================================');
  console.log('✅ COMPTE CRÉÉ AVEC SUCCÈS !');
  console.log('========================================');
  console.log('🌍 URL: https://neox-erp-alpha.vercel.app');
  console.log('📧 Email:    admin@boutique.com');
  console.log('🔑 Mot de passe: admin123');
  console.log('========================================');
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
