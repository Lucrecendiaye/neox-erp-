# TODO - Suite (reprise de session)

> Dernière session : août 2026. Site de test : https://neox-erp-alpha.vercel.app
> Contexte : prévention quotas Supabase (les photos ne DOIVENT plus être en base64).

## ✅ Fait et déployé (dernière session)
- [x] Photos produits → **Cloudinary** (compression 900px/JPEG 0.72) au lieu du base64 — `src/lib/imageStorage.ts`, `PhotoUpload.tsx`, `SettingsPage.tsx`, garde-fous dans `syncEngine.ts`/`realtime.ts`.
- [x] Purge auto `product_history` (>6 mois) et `audit_logs` (>90 jours) — `src/lib/purgeData.ts` + `App.tsx` (1×/jour).
- [x] Bug corrigé : `user.businessId` était vide (`profile?.business_id` → `profile?.businessId`).
- [x] Bug corrigé : erreurs 400 sur `audit_logs` (`userName`/`userRole` camelCase inexistants en Supabase) — `sanitizeForTable` dans `syncEngine.ts` + `seed-supabase.ts`.
- [x] Vérifié en ligne : upload photo → URL `res.cloudinary.com` (pas de base64), purge fonctionnelle, sync audit_logs = 0 erreur.

## 🔴 À VÉRIFIER en priorité
- [ ] **Purge du cache SW des clients après chaque déploiement** (le service worker sert d'anciens chunks → l'ancien code base64 s'exécute). Tester avec une 2e photo après un redéploiement.
- [ ] Tester une **vente POS complète en cloud** (produits + photos + paiement) et vérifier `sales.items`.
- [ ] Vérifier le **compteur de quota Supabase** dans le dashboard après une semaine d'usage réel.

## 📦 Avant mise en production
- [ ] Estimer le nombre max de boutiques/produits avant la limite 500 Mo (calcul de capacité).
- [ ] Vérifier que le bucket `erp-images` Supabase Storage est bien configuré (fallback si Cloudinary indisponible).

## Commandes utiles
- Build + tests : `npm run build` / `npm run test` (tsc intégré au build)
- Déploiement prod : `npx vercel --prod --yes` (alias `neox-erp-alpha.vercel.app`)
- Test de bout en bout : navigateur Playwright sur le site + `navigator.serviceWorker.getRegistrations()` → `unregister()` + `caches.keys()` → `delete()` AVANT de valider un nouveau déploiement.

## Références
- Suivi quota : `TODO-PREVENTION-QUOTA.md`
