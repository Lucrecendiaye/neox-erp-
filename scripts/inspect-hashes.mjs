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
  const r = await pgc.query(
    `select email, encrypted_password, email_confirmed_at, confirmation_sent_at, aud, role, raw_app_meta_data, raw_user_meta_data from auth.users where email like 'login-test-%' order by created_at desc limit 3`
  )
  r.rows.forEach((u) => {
    console.log('EMAIL:', u.email)
    console.log('  hash:', u.encrypted_password)
    console.log('  email_confirmed_at:', u.email_confirmed_at)
    console.log('  confirmation_sent_at:', u.confirmation_sent_at)
    console.log('  aud:', u.aud, 'role:', u.role)
    console.log('  app_meta:', JSON.stringify(u.raw_app_meta_data))
    console.log('  user_meta:', JSON.stringify(u.raw_user_meta_data))

    // query real user created via supabase auth signup
    const real = pgc.query(
      `select encrypted_password from auth.users where raw_app_meta_data->>'provider' = 'email' and encrypted_password like '$%' order by created_at desc limit 1`
    )
  })
  const real = await pgc.query(
    `select email, encrypted_password from auth.users where encrypted_password like '$2%' limit 1`
  )
  console.log('\nREAL USER SAMPLE:')
  real.rows.slice(0, 2).forEach((u) => console.log(' ', u.email, '=>', u.encrypted_password))
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})