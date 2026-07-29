import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

const { rows: fks } = await client.query(`
  SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND (tc.table_name = 'profiles' OR tc.table_name = 'businesses')
`)

console.log('Foreign keys:', JSON.stringify(fks, null, 2))

// Check current RLS policies
const { rows: policies } = await client.query(`
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
  FROM pg_policies
  WHERE tablename IN ('profiles', 'businesses')
  ORDER BY tablename, policyname
`)

console.log('Policies:', JSON.stringify(policies, null, 2))

await client.end()
