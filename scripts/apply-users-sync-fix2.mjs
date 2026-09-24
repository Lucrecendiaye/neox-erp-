import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sql = `
-- Durcir admin_delete_user : supprime aussi la ligne profiles (pas de FK cascade)
create or replace function public.admin_delete_user(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_biz text;
  v_target_biz text;
begin
  select p."businessId" into v_biz
  from public.profiles p where p."auth_user_id" = auth.uid() limit 1;
  if v_biz is null or not public.tenant_caller_is_profile_admin(v_biz) then
    if auth.role() <> 'service_role' then return false; end if;
  end if;
  select p."businessId" into v_target_biz
  from public.profiles p where p."auth_user_id" = p_auth_user_id limit 1;
  if v_target_biz is null or (auth.role() <> 'service_role' and v_target_biz is distinct from v_biz) then
    return false;
  end if;
  delete from public.profiles where "auth_user_id" = p_auth_user_id;
  delete from auth.users where id = p_auth_user_id;
  return true;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to anon, authenticated;

-- admin_create_user : renseigne aussi login_id et is_primary_admin par défaut
create or replace function public.admin_create_user("businessId" text, name text, email text, "loginId" text, password text, role text DEFAULT 'staff'::text, permissions jsonb DEFAULT '{}'::jsonb, phone text DEFAULT NULL::text, status text DEFAULT 'active'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  new_auth_id uuid := gen_random_uuid();
  existing_id uuid;
  normalized_email text := lower(nullif(trim(email), ''));
  caller_biz text;
begin
  if normalized_email is null then
    raise exception 'Email requis' using errcode = 'P0001';
  end if;

  select p."businessId" into caller_biz
  from profiles p
  where p."auth_user_id" = auth.uid()
  limit 1;
  if (caller_biz is null or caller_biz <> "businessId") and auth.role() <> 'service_role' then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  select u.id into existing_id
  from auth.users u
  where lower(coalesce(u.email, '')) = normalized_email
  limit 1;
  if existing_id is not null then
    raise exception 'Un compte existe déjà avec cet email' using errcode = 'P0001';
  end if;

  select u.id into existing_id
  from auth.users u
  where lower(coalesce(u.raw_user_meta_data->>'loginId', '')) = lower(coalesce("loginId", ''))
  limit 1;
  if existing_id is not null then
    raise exception 'Cet identifiant de connexion est déjà utilisé' using errcode = 'P0001';
  end if;

insert into auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    reauthentication_token,
    reauthentication_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at, updated_at,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_auth_id,
    'authenticated',
    'authenticated',
    normalized_email,
    crypt(coalesce(password, 'default123'), gen_salt('bf', 10)),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    null,
    '',
    null,
    '',
    0,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'loginId', coalesce("loginId", normalized_email),
      'name', coalesce(name, 'Utilisateur'),
      'phone', phone,
      'admin_created', 'true'
    ),
    now(), now(),
    false, false
  );

  insert into public.profiles (
    id, "businessId", email, name, phone, role, permissions,
    "auth_user_id", "is_active", "createdAt", "updatedAt",
    login_id, status, is_primary_admin
  ) values (
    new_auth_id::text,
    "businessId",
    normalized_email,
    coalesce(name, 'Utilisateur'),
    phone,
    coalesce(role, 'staff'),
    case when permissions is null then '{}'::jsonb else permissions end,
    new_auth_id,
    coalesce(status, 'active') = 'active',
    now(), now(),
    coalesce("loginId", normalized_email),
    coalesce(status, 'active'),
    false
  );

  return new_auth_id;
end;
$function$;

grant execute on function public.admin_create_user(text, text, text, text, text, text, jsonb, text, text) to anon, authenticated;
`

const c = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  await c.query(sql)
  console.log('functions updated OK')
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
}
await c.end()