import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {

    const formData = req.body

    // เรียก SlipOK
    const slipResponse = await fetch("https://api.slipok.com/api/line/apikey/YOUR_API_KEY", {
      method: "POST",
      body: formData
    })

    const result = await slipResponse.json()

    if (!result.success) {
      return res.status(400).json({ success: false })
    }

    const amount = Number(result.data.amount)
    const transactionId = result.data.transaction_id
    const uid = result.data.receiver?.account?.name // หรือดึงจาก client header แทน (เดี๋ยวอธิบายต่อ)

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 🔒 เช็คสลิปซ้ำ
    const { data: existing } = await supabase
      .from("topups")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle()

    if (existing) {
      return res.status(400).json({ success: false, message: "Slip already used" })
    }

    // 🔥 ดึง balance เดิม
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", uid)
      .single()

    const oldBalance = profile?.balance || 0
    const newBalance = oldBalance + amount

    // 💰 อัปเดต balance
    await supabase
      .from("profiles")
      .update({ balance: newBalance })
      .eq("id", uid)

    // 🧾 บันทึก topup
    await supabase
      .from("topups")
      .insert([{
        user_id: uid,
        amount: amount,
        transaction_id: transactionId
      }])

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Server error' })
  }
}
