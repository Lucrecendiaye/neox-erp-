# NeoX ERP — Infrastructure & suivi du quota Supabase

Ce projet tourne sur **Vercel** (hébergement du front) + **Supabase** (base, auth, storage),
tous deux sur des plans **gratuits**. Ce document explique comment surveiller et éviter les coupures.

## Classification des plans (obligatoire — politique studio)

| Service | Plan | Type de gratuité | Risque principal |
|---|---|---|---|
| Supabase | Free | **hard-quota** + **sleeps** | Projet **mis en pause après 7 jours d'inactivité** ; à 100% d'un quota → requêtes en **402** |
| Vercel | Hobby | commercial-restricted | Usage non commercial seulement ; passer à Pro ($20/mo) dès 1er client |

## Référence des limites Supabase (Free)

| Ressource | Limite Free |
|---|---|
| Database | 0,5 GB |
| Egress | 5 GB / mois |
| Storage | 1 GB |
| Realtime messages | 2 000 000 / mois |
| Realtime connexions simultanées | 200 |
| Monthly Active Users | 50 000 |

⚠️ Depuis le 06/09/2026, la **période de grâce est terminée** : au dépassement, le projet est **restreint**
(HTTP 402) au lieu de simplement ralentir.

## Garde-fous en place

### 1. Keep-alive automatique (GitHub Actions)
`.github/workflows/keep-alive.yml` — ping **toutes les 10 minutes** :
- Supabase (`/rest/v1/customers?select=id&limit=1`)
- L'app Vercel

Empêche la mise en pause par inactivité et détecte une coupure.

**Secrets GitHub requis :** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(Repo → Settings → Secrets and variables → Actions).

Test manuel :
```bash
npm run keep-alive
```

### 2. Audit de quota hebdomadaire
`.github/workflows/quota-check.yml` — chaque lundi, alerte si une ressource ≥ **80%**.

**Secrets GitHub requis :** `SUPABASE_ACCESS_TOKEN` (https://supabase.com/dashboard/account/tokens),
`SUPABASE_PROJECT_REF` (ex: `banknoizmiprfwhrcihc`).

Test manuel :
```bash
npm run quota-check
```

### 3. Bannière d'état dans l'app
L'app vérifie le cloud toutes les 60 s (`startCloudHealthMonitor`) :
- Si Supabase devient injoignable (pause, quota, réseau) → **bannière rouge** :
  « Synchronisation cloud indisponible — Vos données restent enregistrées sur cet appareil. »
- Jamais d'écran vide ni d'échec silencieux.

### 4. Mode local-first
Les données sont d'abord écrites dans **IndexedDB**, puis synchronisées vers Supabase.
Même si le cloud tombe, l'app reste utilisable : aucune perte de saisie.

## Quand passer au plan payant

Passer à **Supabase Pro ($25/mo)** dès que :
- un client signe (production réelle),
- ou une ressource approche 80%,
- ou l'app doit être garantie disponible (pas de pause).

Passer **Vercel Pro ($20/mo)** dès le premier client (obligation ToS Hobby).

## Vérifier l'usage manuellement

- Supabase : https://supabase.com/dashboard/org/_/usage
- Vercel : https://vercel.com/dashboard → Usage
