-- =====================================================================
-- NEOX ERP — Refonte authentification (PROBLÈME 4)
-- À exécuter une fois dans le SQL Editor Supabase.
-- Ajoute : statut de compte (actif/bloqué/suspendu/supprimé), 2FA email,
--          et l'OTP e-mail pour la connexion.
-- =====================================================================

-- 1) Colonnes sur profiles
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists two_factor_enabled boolean not null default false;

-- Garde : statut cohérent avec is_active
create or replace function public.sync_profile_status()
returns trigger as $$
begin
  if new.status = 'active' then
    new.is_active := true;
  elsif new.status in ('blocked','suspended','deleted') then
    new.is_active := false;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_profile_status on public.profiles;
create trigger trg_sync_profile_status
  before insert or update on public.profiles
  for each row execute function public.sync_profile_status();

-- 2) Index pour la recherche par identifiant unique
create index if not exists idx_profiles_email_lower on public.profiles (lower(email));
create index if not exists idx_profiles_phone_lower on public.profiles (lower(phone));

-- =====================================================================
-- NOTE EMAIL (paramètre le plus important) :
-- Activez l'envoi d'e-mails dans Authentication > Providers > Email.
-- Configurez le modèle "OTP" (6 chiffres) avec la variable {{ .Token }}.
-- Sans cela, l'OTP e-mail (connexion / 2FA) ne sera jamais reçu.
-- =====================================================================
