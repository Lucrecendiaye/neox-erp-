import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://banknoizmiprfwhrcihc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbmtub2l6bWlwcmZ3aHJjaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MTE5OTYsImV4cCI6MjEwMDM4Nzk5Nn0.QzOb9LQGQVB9BNl18Irq2JTC4fck0W0xon7XLy_A5Zo'

const supabase = createClient(supabaseUrl, supabaseKey)

const sql = `
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (auth_user_id, name, email, phone, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Utilisateur'), new.email, new.raw_user_meta_data->>'phone', 'staff');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function public_lookup_email_by_phone(phone text)
returns table(email text) as $$
begin
  return query select p.email from profiles p where p.phone = phone limit 1;
end;
$$ language plpgsql security definer;
`

const { data, error } = await supabase.rpc('exec_sql', { query: sql })

if (error) {
  console.error('Error:', error)
} else {
  console.log('Success:', data)
}
