import pg from 'pg'

const pgc = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await pgc.connect()
  const r = await pgc.query(`select * from auth.users where email like 'normalsignup-%' order by created_at desc limit 1`)
  const normal = r.rows[0]
  const r2 = await pgc.query(`select * from auth.users where email like 'login-test-%' order by created_at desc limit 1`)
  const ours = r2.rows[0]
  const keys = Object.keys(normal)
  console.log('FIELD'.padEnd(32), 'NORMAL'.padEnd(45), 'OURS')
  const interesting = ['id', 'instance_id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at', 'confirmation_token', 'confirmation_sent_at', 'raw_app_meta_data', 'raw_user_meta_data', 'last_sign_in_at', 'created_at', 'updated_at']
  for (const k of keys) {
    const n = normal[k]
    const o = ours?.[k]
    const nv = n === null ? 'NULL' : typeof n === 'object' ? JSON.stringify(n) : '' + n
    const ov = o === null ? 'NULL' : typeof o === 'object' ? JSON.stringify(o) : '' + o
    const mark = JSON.stringify(nv) === JSON.stringify(ov) ? ' ' : '*'
    if (interesting.includes(k) || mark === '*') console.log(mark + ' ' + k.padEnd(30), nv.slice(0, 40).padEnd(44), ov.slice(0, 60))
  }
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})