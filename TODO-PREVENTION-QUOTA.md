# TODO - NeoX ERP : Prévention des quotas Supabase (à faire avant mise en production)

> Statut Supabase : **ACCESSIBLE** (https://banknoizmiprfwhrcihc.supabase.co) — pas bloqué, ~0 donnée synchronisée.
> Objectif : corriger les patterns à risque pour ne JAMAIS atteindre le quota Free (contrairement au 1er ERP).

## 1. 🔴 Photos hors de la base de données — FAIT (à configurer)

**Problème résolu :**
- Avant : `PhotoUpload.tsx` stockait les photos en **base64** dans `products.photos` (colonne `photos jsonb`) → 500 Mo Free épuisés en ~25 produits × 5 photos.
- Maintenant : `src/lib/imageStorage.ts` **compresse** (canvas, max 900px, JPEG 0.72) puis **téléverse** vers un stockage externe ; seul l'URL est conservé dans la base.

**Fichiers modifiés :**
- [x] `src/lib/imageStorage.ts` (nouveau) — `compressImage`, `uploadImage`, `sanitizePayloadForSync`
- [x] `src/components/ui/PhotoUpload.tsx` — compression + upload à la sélection
- [x] `src/modules/settings/SettingsPage.tsx` — logo compressé + téléversé (max 512px)
- [x] `src/lib/syncEngine.ts` — garde-fou : jamais de base64 dans l'upsert Supabase
- [x] `src/lib/realtime.ts` — idem sur `syncWrite`
- [x] `.env.example` — variables Cloudinary documentées

### À CONFIGURER (manuel, par toi)
- [x] Créer un compte Cloudinary gratuit (https://cloudinary.com) — fait (cloud name `f3ghuh2f`)
- [x] Dans Cloudinary → Settings → Upload : créer un **upload preset non signé** (`Unsigned`) — fait (`ch7uiasp`)
- [x] Ajouter dans `.env.local` et Vercel (production, preview, development) :
  - `VITE_CLOUDINARY_CLOUD_NAME`
  - `VITE_CLOUDINARY_UPLOAD_PRESET`
- [ ] Si pas de Cloudinary : créer le bucket **`erp-images`** dans Supabase Storage + politiques d'upload (fallback inclus dans le code)

### À VÉRIFIER
- [x] Tester l'ajout de photos produits → l'URL Cloudinary apparaît dans `products.photos`, pas de base64
  - Vérifié en ligne sur https://neox-erp-alpha.vercel.app : `photos: ["https://res.cloudinary.com/f3ghuh2f/image/upload/v1785793403/products/yqks8djg4c5fxf7preac.jpg"]`
  - ⚠️ Problème rencontré : la **PWA (service worker)** servait des chunks périmés (`PhotoUpload-2ayO2jJX.js`) → l'ancien code base64 s'exécutait. Après purge SW + caches, le nouveau code (Cloudinary) fonctionne. **À penser : vider le cache SW des clients après un déploiement.**
- [x] Vérifier que la base Supabase reste petite après synchronisation (produit test supprimé ensuite)

## 2. 🟠 Realtime — faible risque (gardé tel quel)

- `src/lib/realtime.ts` s'abonne à 21 tables, mais uniquement quand l'app est ouverte.
- Estimation : ~120 messages/jour/boutique → ~3600/mois → **jamais** les 2M Free (même à 100 boutiques).
- Décision : on NE réduit PAS les tables pour ne pas casser la synchro multi-appareils.

## 3. 🟠 Limiter la croissance de la base (500 Mo Free)

- [x] `product_history` : purge automatique des lignes > 6 mois — `src/lib/purgeData.ts` + appel dans `App.tsx` (au démarrage + après connexion, max 1×/jour)
- [x] `audit_logs` : purge automatique > 90 jours — même utilitaire
- [x] Vérifié : `sales.items` (JSONB) ne contient **aucune photo** (que productId, nom, prix, quantité — voir `SaleItem` dans `src/types/index.ts`)
- [x] **Testé en ligne** (neox-erp-alpha.vercel.app) : enregistrements de test vieux de 300 jours insérés local + Supabase → supprimés des deux côtés par la purge. ✅

### 🐞 Bugs préexistants découverts et corrigés pendant ce travail
- **`user.businessId` toujours vide en cloud** : `App.tsx` lisait `profile?.business_id` (snake_case) alors que la colonne réelle est `businessId` → `user.businessId` était `''` (impactait le contexte et empêchait la purge). Corrigé : `profile?.businessId || profile?.business_id`.
- **Échec de sync des `audit_logs` (erreurs 400 chaque minute)** : l'app poussait `userName`/`userLoginId`/`userRole` (camelCase) vers la table Supabase `audit_logs` qui ne contient pas ces colonnes. Corrigé : transform dans `syncEngine.ts` (`sanitizeForTable`) + `seed-supabase.ts` qui ne garde que les colonnes réelles (id, businessId, userId, action, entity, entityId, details, createdAt). Désormais 11 audit_logs locaux = 11 en Supabase, 0 erreur réseau.

## 4. ✅ Avant mise en production

- [x] Test partiel en cloud : produits + photos (URL Cloudinary, pas de base64), purge fonctionnelle, sync audit_logs corrigée, 0 erreur réseau
- [ ] Tester une vraie vente en cloud (POS) et vérifier `sales.items` + compteur de quota
- [ ] Vérifier le compteur de quota dans le dashboard Supabase après une semaine d'usage
- [ ] Estimer le nombre max de boutiques/produits avant limite (calcul de capacité)

## Estimation préventive (photos → URLs externes)

- Base 500 Mo (sans photos) : ~10 ans (1 boutique) / ~2 ans (5 boutiques)
- `product_history` + `audit_logs` purgés automatiquement (6 mois / 90 jours) → croissance bornée
- Storage/Cloudinary : hors quota Supabase
- Realtime : jamais atteint en pratique
