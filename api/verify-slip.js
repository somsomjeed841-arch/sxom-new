import { createClient } from '@supabase/supabase-js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {

    // 🔥 ใช้ formData จาก request โดยตรง
    const formData = await req.formData()

    const uid = formData.get("uid")
    const file = formData.get("files")

    if (!uid || !file) {
      return res.status(400).json({ success:false, message:"Missing data" })
    }

    // ส่งไป SlipOK
    const slipForm = new FormData()
    slipForm.append("files", file)
    slipForm.append("log", "true")

    const slipResponse = await fetch(
      `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_KEY}`,
      {
        method: "POST",
        body: slipForm
      }
    )

    const result = await slipResponse.json()

    if (!result.success) {
      return res.status(400).json({ success:false })
    }

    const amount = Number(result.data.amount)
    const transactionId = result.data.transaction_id

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 🔒 กันสลิปซ้ำ
    const { data: existing } = await supabase
      .from("topups")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle()

    if (existing) {
      return res.status(400).json({ success:false, message:"Slip already used" })
    }

    // 💰 ดึงยอดเดิม
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", uid)
      .single()

    const oldBalance = profile?.balance || 0
    const newBalance = oldBalance + amount

    // อัปเดต balance
    await supabase
      .from("profiles")
      .update({ balance: newBalance })
      .eq("id", uid)

    // บันทึก topup
    await supabase
      .from("topups")
      .insert([{
        user_id: uid,
        amount: amount,
        transaction_id: transactionId
      }])

    return res.status(200).json({ success:true })

  } catch (err) {

    console.error(err)
    return res.status(500).json({ error: err.message })

  }
}
