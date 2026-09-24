import pg from 'pg'

const c = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const roleType = await c.query(
  `select data_type from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role'`
)
console.log('profiles.role data_type:', roleType.rows[0]?.data_type)

const biz = '9173b109-093e-4665-adfa-599d35814d96'
const stamp = Date.now()

const make = async (role) => {
  try {
    const r = await c.query(
      `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as id`,
      [biz, 'RoleTest ' + role, 'role' + stamp + '-' + role + '@neoxerp.app', 'role' + stamp + '-' + role, 'RoleTest99!', role, '[]', '', 'active']
    )
    return 'OK uid=' + r.rows[0].id
  } catch (e) {
    return 'ERROR: ' + e.message.split('\n')[0]
  }
}

console.log('role=Vendeur  ->', await make('Vendeur'))
console.log('role=Caissier ->', await make('Caissier'))
console.log('role=staff    ->', await make('staff'))

await c.end()
process.exit(0)
