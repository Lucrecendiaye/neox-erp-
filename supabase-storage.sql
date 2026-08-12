-- ============================================================
-- NeoX ERP - Bucket de stockage "erp-images"
-- À exécuter dans Supabase Dashboard -> SQL Editor -> New query
-- Idempotent : peut être relancé sans erreur.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('erp-images', 'erp-images', true)
on conflict (id) do update set public = true;

-- Lecture publique (les <img> des produits/logos ne portent pas de jeton auth)
drop policy if exists "erp_images_public_read" on storage.objects;
create policy "erp_images_public_read" on storage.objects
  for select using (bucket_id = 'erp-images');

-- Upload des utilisateurs connectés
drop policy if exists "erp_images_auth_upload" on storage.objects;
create policy "erp_images_auth_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'erp-images');

-- Mise à jour / suppression par l'utilisateur connecté
drop policy if exists "erp_images_auth_update" on storage.objects;
create policy "erp_images_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'erp-images');

drop policy if exists "erp_images_auth_delete" on storage.objects;
create policy "erp_images_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'erp-images');
