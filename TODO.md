# NeoX ERP — TODO Travaux en cours

> Dernière mise à jour : 22/07/2026

---

## CE QUI A ÉTÉ FAIT

### ✅ Core (stable)
- [x] 14 modules ERP fonctionnels (Dashboard, Products, Stock, POS, Customers,
      Suppliers, Purchases, Invoices, Payments, Accounting, Credit, Reports,
      Notifications, Audit, Settings)
- [x] Code splitting (React.lazy → 50+ chunks)
- [x] Observables Dexie (`liveQuery` au lieu du polling 3s)
- [x] Pagination sur toutes les listes/tableaux
- [x] Système de toasts + confirmations suppression
- [x] Icônes Lucide (plus d'émojis)
- [x] Export PDF (jsPDF + autotable)
- [x] Scanner code-barres + Photo upload

### ✅ Améliorations DigiKhata
- [x] Multi-business (switch sociétés dans Header)
- [x] Payroll (Employés, Présences, Paie)
- [x] Cash Book (Caisse IN/OUT)
- [x] Multi-utilisateurs (rôles, permissions)
- [x] CRM (Leads — vue Kanban + Table)
- [x] SMS Rappels (relances WhatsApp)
- [x] Bill Book (templates factures)
- [x] App Lock (verrouillage PIN)
- [x] Multi-devises (FCFA/EUR/USD configurable)
- [x] Recherche globale (Ctrl+K)
- [x] Export/Import JSON (sauvegarde DB)
- [x] Impression étiquettes codes-barres
- [x] Authentification locale (Login/Register, SHA-256)
- [x] Menu utilisateur avec déconnexion
- [x] Données de simulation (16 produits, 5 clients, etc.)

### ✅ Infrastructure
- [x] PWA (Service Worker + manifest.json)
- [x] Responsive mobile/tablette (Tailwind)
- [x] @supabase/supabase-js installé (v7)
- [x] Fichier `supabase-schema.sql` (schéma complet + RLS)
- [x] Fichier `vercel.json` (config déploiement)
- [x] Fichier `.env.example` (variables d'env)

### ✅ Migration Supabase (code)
- [x] Auth : remplacement de l'auth locale par Supabase Auth
- [x] `signIn` / `signUp` / `signOut` avec Supabase
- [x] Session persistée via `onAuthStateChange`
- [x] Fallback automatique vers auth locale (Dexie) si Supabase non configuré
- [x] Hook `useSupabaseQuery` avec Realtime (subscription temps réel)
- [x] Helper CRUD générique `sb.*` (getAll, getById, insert, update, remove, filter)
- [x] Module Products : dual-mode Supabase / Dexie
- [x] Module Customers : dual-mode Supabase / Dexie
- [x] Module Suppliers : dual-mode Supabase / Dexie
- [x] Module Stock : dual-mode Supabase / Dexie
- [x] Module POS (Sales) : dual-mode Supabase / Dexie
- [x] Module Purchases : dual-mode Supabase / Dexie
- [x] Module Invoices : dual-mode Supabase / Dexie
- [x] Module Accounting : dual-mode Supabase / Dexie
- [x] Module Credit : dual-mode Supabase / Dexie
- [x] Module Cash Book : dual-mode Supabase / Dexie
- [x] Module Payroll (Employees, Attendance, Payroll) : dual-mode Supabase / Dexie
- [x] Module CRM (Leads) : dual-mode Supabase / Dexie
- [x] Module Supplier Payments : dual-mode Supabase / Dexie
- [x] Module Dashboard : dual-mode Supabase / Dexie
- [x] Module Notifications : dual-mode Supabase / Dexie
- [x] Module Audit : dual-mode Supabase / Dexie
- [x] Fichier `.env.local` créé

---

## À FAIRE

### 🔴 Manuel (à faire par toi)

- [ ] Créer un projet Supabase (https://supabase.com)
- [ ] Créer un repo GitHub pour le code
- [ ] Exécuter `supabase-schema.sql` dans Supabase SQL Editor
- [ ] Copier les clés API (URL + anon key) → les mettre dans `.env.local`
- [ ] Vérifier que le trigger `handle_new_user()` est bien créé (dans le SQL)
- [ ] Pousser le code sur GitHub
- [ ] Connecter le repo à Vercel
- [ ] Ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Vercel Dashboard
- [ ] Déployer et tester

### 🟡 Code déjà fait (test après configuration Supabase)

- [ ] Tester la connexion Supabase (une fois les clés mises à jour)
- [ ] Tester l'inscription/connexion via Supabase Auth
- [ ] Tester le module Products en mode cloud

### 🟢 Prochaines migrations (quand Products est validé)

- [ ] Migrer **Customers / Suppliers** (même pattern que Products)
- [ ] Migrer **Stock** (movements)
- [ ] Migrer **Sales (POS)**
- [ ] Migrer **Purchases**
- [ ] Migrer **Invoices**
- [ ] Migrer **Accounting**
- [ ] Migrer **Credit / Cash Book / Payroll / CRM / Notifications / Audit**

### 🟢 Améliorations futures

- [ ] Migration IndexedDB → Supabase : outil d'import des données locales
- [ ] Mode hors-ligne : service worker + cache Dexie local
- [ ] Notifications push (via Supabase Realtime)
- [ ] Upload photos (via Supabase Storage)
- [ ] Domaines personnalisés (optionnel)

---

## Fichiers importants

| Fichier | Rôle |
|---------|------|
| `src/lib/supabase.ts` | Client Supabase (URL + clé) |
| `src/lib/supabase-db.ts` | Helper CRUD Supabase (à finaliser) |
| `supabase-schema.sql` | Schéma PostgreSQL complet |
| `vercel.json` | Configuration déploiement Vercel |
| `.env.example` | Variables d'environnement |
| `MIGRATION_SUPABASE.md` | Roadmap détaillée |
| `src/db/index.ts` | Ancien schéma Dexie (à conserver pour fallback offline) |
| `src/lib/auth.ts` | Ancienne auth locale (à remplacer par Supabase Auth) |
