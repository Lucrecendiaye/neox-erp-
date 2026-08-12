-- Fix connexion : l'app cherche le profil AVANT validation du mot de passe,
-- mais RLS bloque la lecture anon de profiles -> login toujours refusé.
-- On crée une fonction security definer qui contourne RLS pour la seule recherche de login.
create or replace function public_lookup_profile(p_identifier text)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_row jsonb;
begin
  select to_jsonb(pr) into v_row
  from public.profiles pr
  where pr.email = p_identifier
     or lower(coalesce(pr."email", '')) = lower(p_identifier)
     or pr."phone" = p_identifier
     or pr."auth_user_id" in (select u.id from auth.users u where lower(coalesce(u.raw_user_meta_data->>'loginId', '')) = lower(p_identifier))
  order by pr."createdAt" asc
  limit 1;
  return v_row;
end;
$$;

revoke all on function public_lookup_profile(text) from public;
grant execute on function public_lookup_profile(text) to anon, authenticated;
