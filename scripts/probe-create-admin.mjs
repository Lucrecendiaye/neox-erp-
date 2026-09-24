import pg from 'pg'
const c = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432, user: 'postgres', database: 'postgres',
  password: 'Lucrecendi@ye1974', ssl: { rejectUnauthorized: false },
})
await c.connect()
const stamp = Date.now()
const loginId = 'admin' + stamp.toString().slice(-8)
const email = loginId + '@neoxerp.app'
const password = 'AdminTest99!'
const biz = '9173b109-093e-4665-adfa-599d35814d96'
const r = await c.query(
  `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as id`,
  [biz, 'Admin E2E ' + stamp, email, loginId, password, 'admin', '["*"]', '', 'active']
)
console.log(JSON.stringify({ uid: r.rows[0].id, loginId, email, password }, null, 2))
await c.end()