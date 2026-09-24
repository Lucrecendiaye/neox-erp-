import pg from 'pg'
const c = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432, user: 'postgres', database: 'postgres',
  password: 'Lucrecendi@ye1974', ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name='sales' and column_name in ('paymentMethod','splitPayments','status','paid','change')`)
for (const row of r.rows) console.log(row.column_name, '->', row.udt_name || row.data_type)
const sells = await c.query(`select paymentMethod, splitPayments from public.sales order by "createdAt" desc limit 8`)
for (const row of sells.rows) console.log('sale:', JSON.stringify(row).slice(0, 300))
const enumDef = await c.query(`select column_default from information_schema.columns where table_schema='public' and table_name='sales' and column_name='paymentMethod'`)
console.log('default:', enumDef.rows[0]?.column_default)
await c.end()
process.exit(0)