# NeoX ERP — Roadmap Migration Supabase + Vercel

## Étape 1 : Comptes cloud
- [ ] Créer compte Supabase (https://supabase.com)
- [ ] Créer compte Vercel (https://vercel.com)
- [ ] Créer un projet Supabase (gratuit)
- [ ] Récupérer les clés API (anon public + service_role)
- [ ] Connecter Vercel au repo GitHub

## Étape 2 : Base de données Supabase
- [ ] Installer `@supabase/supabase-js`
- [ ] Créer `src/lib/supabase.ts` (client)
- [ ] Créer le schéma SQL (migration)
- [ ] Ajouter les politiques RLS (Row Level Security)
- [ ] Exécuter la migration dans Supabase Dashboard

## Étape 3 : Authentification
- [ ] Remplacer l'auth locale par Supabase Auth
- [ ] Login avec email/téléphone
- [ ] Création de compte
- [ ] Session persistée (JWT)
- [ ] Déconnexion

## Étape 4 : Migration des données
- [ ] Créer la couche d'accès Supabase (remplace Dexie)
- [ ] Adapter `useLiveQuery` pour Supabase
- [ ] Créer hook `useSupabaseQuery` (temps réel)
- [ ] Migrer module Produits
- [ ] Migrer module Clients
- [ ] Migrer module Fournisseurs
- [ ] Migrer module Stock
- [ ] Migrer module Ventes (POS)
- [ ] Migrer module Achats
- [ ] Migrer module Factures
- [ ] Migrer module Comptabilité
- [ ] Migrer module Crédit
- [ ] Migrer module Caisse
- [ ] Migrer module Paie
- [ ] Migrer module CRM
- [ ] Migrer module Notifications
- [ ] Migrer module Audit
- [ ] Migrer module Utilisateurs

## Étape 5 : Déploiement Vercel
- [ ] Pousser le code sur GitHub
- [ ] Connecter le repo à Vercel
- [ ] Configurer les variables d'environnement (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] Déployer
- [ ] Tester en ligne
- [ ] Configurer domaine personnalisé (optionnel)

## Étape 6 : Test multi-appareils
- [ ] Se connecter depuis un PC
- [ ] Se connecter depuis un téléphone
- [ ] Vérifier la synchronisation des données
- [ ] Vérifier le mode hors-ligne (PWA)

---

## Stack actuelle (à conserver)
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4
- Zustand 5 (stores)
- Lucide (icônes)
- jsPDF (export PDF)
- Chart.js (graphiques)

## Stack cloud (nouveau)
- Supabase (PostgreSQL + Auth + Realtime + Storage)
- Vercel (hébergement frontend + Serverless)
- GitHub (source control)
