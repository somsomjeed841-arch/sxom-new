import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {

    const formData = req.body
    const uid = formData.get("uid")   // ✅ เอาจาก client

    if (!uid) {
      return res.status(400).json({ message: "no uid" })
    }

    // ✅ เรียก SlipOK
    const slipResponse = await fetch(
      "https://api.slipok.com/api/line/apikey/61738",
      {
        method: "POST",
        body: formData
      }
    )

    const result = await slipResponse.json()

    if (!result.success) {
      return res.status(400).json({ message: "slip invalid" })
    }

    const amount = Number(result.data.amount)
    const transactionId = result.data.transaction_id

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
      return res.status(400).json({ message: "Slip already used" })
    }

    // 💰 เพิ่มเงินแบบ atomic
    await supabase.rpc("increment_balance", {
      uid_input: uid,
      amount_input: amount
    })

    // 🧾 บันทึก
    await supabase.from("topups").insert({
      user_id: uid,
      amount,
      transaction_id: transactionId
    })

    return res.json({ success: true })

  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: "server error" })
  }
}
