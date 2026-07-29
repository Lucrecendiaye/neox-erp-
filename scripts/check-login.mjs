import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://banknoizmiprfwhrcihc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbmtub2l6bWlwcmZ3aHJjaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MTE5OTYsImV4cCI6MjEwMDM4Nzk5Nn0.QzOb9LQGQVB9BNl18Irq2JTC4fck0W0xon7XLy_A5Zo')
const r = await supabase.auth.signInWithPassword({ email: 'boutique@neoxerp.com', password: 'Test@123456' })
console.log(JSON.stringify({ error: r.error?.message, user: r.data.user?.id, session: !!r.data.session }, null, 2))
