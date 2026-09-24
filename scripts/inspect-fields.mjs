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
  // Compare a real signup user (boutique@neoxerp.com or similar) vs our inserted one
  const r = await pgc.query(
    `select email, instance_id, aud, role, email_confirmed_at, confirmation_sent_at,
       confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
       phone, phone_change_token, reauthentication_token, raw_app_meta_data,
       created_at, updated_at, last_sign_in_at, banned_until
     from auth.users
     order by created_at desc
     limit 4`
  )
  r.rows.slice(0, 2).forEach((u) => {
    console.log('===========')
    console.log('EMAIL:', u.email)
    console.log('  instance_id:', u.instance_id)
    console.log('  aud:', u.aud, '| role:', u.role)
    console.log('  confirmed:', u.email_confirmed_at, '| sent:', u.confirmation_sent_at)
    console.log('  conf_token:', u.confirmation_token === null ? 'NULL' : ('' + u.confirmation_token).slice(0, 30))
    console.log('  recovery_token:', u.recovery_token === null ? 'NULL' : ('' + u.recovery_token).slice(0, 30))
    console.log('  email_change_token_new:', u.email_change_token_new === null ? 'NULL' : ('' + u.email_change_token_new).slice(0, 30))
    console.log('  email_change_token_current:', u.email_change_token_current === null ? 'NULL' : '')
    console.log('  phone:', u.phone, '| phone_change_token:', u.phone_change_token === null ? 'NULL' : ('' + u.phone_change_token).slice(0, 30))
    console.log('  reauth_token:', u.reauthentication_token === null ? 'NULL' : ('' + u.reauthentication_token).slice(0, 30))
    console.log('  phone_change_sent_at:', u.phone_change_sent_at)
    console.log('  banned_until:', u.banned_until)
    console.log('  last_sign_in_at:', u.last_sign_in_at)
    console.log('  instance_first row check')

    // check updated_at vs created_at
    console.log('  updated_at:', u.updated_at, 'created_at:', u.created_at)
  })
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})