-- =====================================================================
-- Neox ERP - PARTIE 4/4 : accès au profil pour la lecture
-- Sans ce SELECT sur profiles, les politiques neox_auth_all_* de la
-- partie 3 renvoient businessId = NULL => toutes les écritures bloquées.
-- Idempotent.
-- =====================================================================

alter table public.profiles enable row level security;

drop policy if exists "neox_profile_select_own" on public.profiles;
create policy "neox_profile_select_own" on public.profiles
  for select to authenticated
  using ("auth_user_id" = auth.uid());

drop policy if exists "neox_profile_update_own" on public.profiles;
create policy "neox_profile_update_own" on public.profiles
  for update to authenticated
  using ("auth_user_id" = auth.uid())
  with check ("auth_user_id" = auth.uid());