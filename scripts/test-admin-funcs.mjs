import pg from 'pg'

const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()

  const biz = await client.query('select id from public.businesses limit 1')
  const businessId = biz.rows[0]?.id
  console.log('businessId:', businessId)

  const testEmail = 'admin-test-' + Date.now() + '@neoxerp.app'
  const res = await client.query(
    `select public.admin_create_user($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) as auth_id`,
    [businessId, 'Test Admin', testEmail, 'testadmin', 'secret123', 'admin', JSON.stringify({ a: 1 }), '775000000', 'active']
  )
  const authId = res.rows[0].auth_id
  console.log('auth_id:', authId)

  const profile = await client.query(
    `select id, "businessId", email, name, role, permissions, "auth_user_id", "is_active" from profiles where "auth_user_id" = $1`,
    [authId]
  )
  console.log('PROFILE:', profile.rows[0])

  const reset = await client.query(
    `select public.admin_reset_password($1, 'newpass123') as ok`,
    [testEmail]
  )
  console.log('reset ok:', reset.rows[0].ok)

  const authuser = await client.query(
    `select id, email, encrypted_password is not null as has_hash, raw_user_meta_data from auth.users where id = $1`,
    [authId]
  )
  console.log('AUTH USER:', authuser.rows[0])

  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})