import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, user_id, amount } = req.body

  if (!code || !user_id || !amount) {
    return res.status(400).json({ error: 'Missing data' })
  }

  const { data: used } = await supabase
    .from('used_codes')
    .select('*')
    .eq('code', code)
    .single()

  if (used) {
    return res.status(400).json({ error: 'Code already used' })
  }

  await supabase.from('used_codes').insert({
    code
  })

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', user_id)
    .single()

  const newBalance = (user.balance || 0) + amount

  await supabase
    .from('users')
    .update({ balance: newBalance })
    .eq('id', user_id)

  await supabase.from('transactions').insert({
    user_id,
    amount,
    type: 'topup'
  })

  res.json({ success: true, balance: newBalance })
}
