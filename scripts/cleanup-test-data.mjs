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
  const del = await pgc.query(`
    delete from public.profiles where email like '%-test-%.app'
       or email like '%-test%.app'
       or email like 'admin-test-%@%.app'
       or email like 'login-test-%@neoxerp.app'
       or email like 'member-%@neoxerp.app'
       or email like 'rpc-%@neoxerp.app'
       or email like 'resettarget-%@neoxerp.app'
       or email like 'via-rpc-%@neoxerp.app'
       or email like 'normal%signup-%@neoxerp.app'
       or email like 'flow-%@neoxerp.app'`
  )
  console.log('deleted profiles:', del.rowCount)

  const da = await pgc.query(`
    delete from public.accounts where id like 'acc-test-%' and code = '999'`)
  console.log('deleted test accounts:', da.rowCount)

  const db2 = await pgc.query(`
    delete from public.bon_sorties where id like 'bon-test-%'`)
  console.log('deleted test bon_sorties:', db2.rowCount)

  const du = await pgc.query(`
    delete from auth.users where email like '%-test%@%.app' and raw_user_meta_data->>'admin_created' = 'true'
      or email like 'member-%@neoxerp.app'
      or email like 'rpc-%@neoxerp.app'
      or email like 'resettarget-%@neoxerp.app'
      or email like 'viarpc-te%'
      or email like 'normal%signup-%@neoxerp.app'
      or email like 'flow-%@neoxerp.app'`
  )
  console.log('deleted auth users:', du.rowCount)

  const l = await pgc.query(`select email from auth.users where email like '%test%@%.app' or email like '%member-%@neoxerp.app'`)
  console.log('remaining test auth:', l.rows)
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})