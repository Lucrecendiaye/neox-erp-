-- ============================================================
-- FIX LOGIN PAR TÉLÉPHONE
-- La fonction public_lookup_email_by_phone était cassée :
--   "column reference phone is ambiguous" (42702) → login par
--   téléphone toujours refusé. À exécuter dans la console SQL
--   Supabase (SQL Editor). Version AVEC garde numérique
--   (évite qu'un lookup email ne corresponde à un téléphone vide).
-- ============================================================

-- 1) Email par téléphone : paramètre préfixé p_ + normalisation
drop function if exists public_lookup_email_by_phone(text);
create or replace function public_lookup_email_by_phone(phone text)
returns table (email text)
language plpgsql security definer
set search_path = public
as $$
begin
  -- NB: $1 (paramètre positionnel) évite l'ambiguïté plpgsql avec la colonne "phone"
  return query
    select p.email
    from public.profiles p
    where $1 ~ '[0-9]'
      and regexp_replace(coalesce(p."phone", ''), '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
    limit 1;
end;
$$;

-- 2) Lookup profil : normalisation du téléphone avec garde numérique
create or replace function public_lookup_profile(p_identifier text)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_row jsonb;
begin
  select to_jsonb(pr) into v_row
  from public.profiles pr
  where pr."email" = p_identifier
     or lower(coalesce(pr."email", '')) = lower(p_identifier)
     or pr."phone" = p_identifier
     or (p_identifier ~ '[0-9]' and regexp_replace(coalesce(pr."phone", ''), '[^0-9]', '', 'g') = regexp_replace(p_identifier, '[^0-9]', '', 'g'))
     or pr."auth_user_id" in (select u.id from auth.users u where lower(coalesce(u.raw_user_meta_data->>'loginId', '')) = lower(p_identifier))
  order by pr."createdAt" asc
  limit 1;
  return v_row;
end;
$$;

revoke all on function public_lookup_profile(text) from public;
grant execute on function public_lookup_profile(text) to anon, authenticated;
grant execute on function public_lookup_email_by_phone(text) to anon, authenticated;
