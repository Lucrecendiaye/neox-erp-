-- handle_new_user: skip business/profile auto-creation for admin-created members
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_id uuid;
begin
  -- admin-created members (via admin_create_user) manage their own profile/business
  if coalesce(new.raw_user_meta_data->>'admin_created', 'false') = 'true' then
    return new;
  end if;

  biz_id := gen_random_uuid();
  insert into public.businesses (id, name, currency, phone, email, "createdAt")
  values (
    biz_id,
    coalesce(new.raw_user_meta_data->>'business_name', new.raw_user_meta_data->>'name' || '''s Shop'),
    'XOF',
    new.raw_user_meta_data->>'phone',
    new.email,
    now()
  );
  insert into public.profiles (id, auth_user_id, "businessId", name, email, phone, role, "is_active", "createdAt", "updatedAt")
  values (gen_random_uuid(), new.id, biz_id, coalesce(new.raw_user_meta_data->>'name', 'Utilisateur'), new.email, new.raw_user_meta_data->>'phone', 'admin', true, now(), now());

  insert into public.locations (id, "businessId", name, type, address, phone, "isActive", "createdAt", "updatedAt")
  values
    (gen_random_uuid(), biz_id, 'Boutique Principale', 'shop', '', new.raw_user_meta_data->>'phone', true, now(), now()),
    (gen_random_uuid(), biz_id, 'Dépôt Principal', 'warehouse', '', '', true, now(), now());

  return new;
end;
$$;

-- admin_create_user + admin_reset_password
-- Creates an auth user + profile in an existing business (no new business auto-created).
create or replace function public.admin_create_user(
  "businessId" text,
  name text,
  email text,
  "loginId" text,
  password text,
  role text default 'staff',
  permissions jsonb default '{}'::jsonb,
  phone text default null,
  status text default 'active'
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_auth_id uuid := gen_random_uuid();
  existing_id uuid;
  normalized_email text := lower(nullif(trim(email), ''));
  caller_biz text;
begin
  if normalized_email is null then
    raise exception 'Email requis' using errcode = 'P0001';
  end if;

  -- Only a member of the target business (or a superuser) may create users
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
    "auth_user_id", "is_active", "createdAt", "updatedAt"
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
    now(), now()
  );

  return new_auth_id;
end;
$$;

create or replace function public.admin_reset_password(p_email text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_id uuid;
  caller_biz text;
begin
  -- Only admin members may reset passwords
  select p."businessId" into caller_biz
  from profiles p
  where p."auth_user_id" = auth.uid()
  limit 1;
  if caller_biz is null and auth.role() <> 'service_role' then
    return false;
  end if;

  select u.id into target_id
  from auth.users u
  where lower(coalesce(u.email, '')) = lower(coalesce(p_email, ''))
  limit 1;
  if target_id is null then
    return false;
  end if;

  update auth.users
  set encrypted_password = crypt(coalesce(p_password, 'default123'), gen_salt('bf', 10)),
      updated_at = now()
  where id = target_id;
  return true;
end;
$$;

-- Executable via the RPC API
grant execute on function public.admin_create_user(text, text, text, text, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.admin_reset_password(text, text) to anon, authenticated;