import pg from 'pg'
const c = new pg.Client({ host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432, user: 'postgres', database: 'postgres', password: 'Lucrecendi@ye1974', ssl: { rejectUnauthorized: false } })
try {
  await c.connect()
  await c.query(`
    create table if not exists public.invoice_seq (
      business_id text primary key,
      value bigint not null default 0
    )`)
  await c.query(`
    create or replace function public.next_invoice_number(biz text, prefix text default 'FAC-')
    returns text
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      next_val bigint;
      max_existing bigint;
    begin
      perform pg_advisory_xact_lock(hashtext('invoice_' || coalesce(biz, 'x')));

      select value into next_val from public.invoice_seq where business_id = biz for update;

      select coalesce(max(t.seq), 0) into max_existing from (
        select substring(coalesce(v.invoice_number, '') from '\\\\d+$')::bigint as seq
          from public.sales v where v.business_id = biz and coalesce(v.invoice_number, '') ~ '\\\\d+$'
        union all
        select substring(coalesce(i.number, '') from '\\\\d+$')::bigint as seq
          from public.invoices i where i.business_id = biz and coalesce(i.number, '') ~ '\\\\d+$'
      ) t;

      if next_val is null then
        next_val := greatest(coalesce(max_existing, 0), 0);
      end if;
      next_val := greatest(next_val, coalesce(max_existing, 0)) + 1;

      insert into public.invoice_seq (business_id, value) values (biz, next_val)
      on conflict (business_id) do update set value = excluded.value;

      return prefix || lpad(next_val::text, 5, '0');
    end;
    $$;`)
  await c.query('grant execute on function public.next_invoice_number(text, text) to anon, authenticated;')
  console.log('OK next_invoice_number créée')

  const t = await c.query(`select public.next_invoice_number('test-biz', 'FAC-') as n1, public.next_invoice_number('test-biz', 'FAC-') as n2, public.next_invoice_number('autre-biz', 'FAC-') as n3`)
  console.log('T1:', JSON.stringify(t.rows[0]))

  const real = await c.query(`select public.next_invoice_number('807d155c-46b6-46e1-86f3-574e9c4e454c', 'FAC-') as n`)
  console.log('REAL prev next:', JSON.stringify(real.rows[0]))

  const again = await c.query(`select public.next_invoice_number('807d155c-46b6-46e1-86f3-574e9c4e454c', 'FAC-') as n`)
  console.log('REAL next+1 :', JSON.stringify(again.rows[0]))
} catch (e) {
  console.log('ERR:', e.message)
} finally {
  await c.end()
}
