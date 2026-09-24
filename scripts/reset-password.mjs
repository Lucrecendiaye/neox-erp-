import pg from 'pg'

const PASSWORD = 'Lucrecendi@ye1974'
const REF = 'banknoizmiprfwhrcihc'

const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: PASSWORD,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

const email = process.argv[2]
const newPassword = process.argv[3]

async function run() {
  if (!email || !newPassword) {
    console.error('Usage: node scripts/reset-password.mjs <email> <newPassword>')
    process.exit(1)
  }
  await client.connect()

  const { rows } = await client.query(
    `SELECT id, email, raw_user_meta_data->>'name' as name FROM auth.users WHERE email = $1`,
    [email]
  )
  if (rows.length === 0) {
    console.error(`Aucun utilisateur trouvé avec cet email: ${email}`)
    process.exit(1)
  }
  const user = rows[0]

  await client.query(
    `UPDATE auth.users SET encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() WHERE id = $1`,
    [user.id, newPassword]
  )
  console.log(`✅ Mot de passe réinitialisé pour "${user.name}" (${user.email})`)

  await client.end()
}

run().catch(e => { console.error(e.message); process.exit(1) })