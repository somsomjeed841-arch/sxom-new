import axios from "axios"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  try {
    const { imageUrl, userId } = req.body

    if (!imageUrl) {
      return res.status(400).json({ message: "no image" })
    }

    // ✅ เรียก SlipOK
    const { data: result } = await axios.post(
      "https://api.slipok.com/api/line/apikey/61738",
      { files: imageUrl }
    )

    console.log("SLIP RESULT:", result)

    if (result.code !== 1000) {
      return res.status(400).json({ message: "slip invalid" })
    }

    const slip = result.data
    if (!slip?.amount || !slip?.transRef) {
      return res.status(400).json({ message: "bad slip data" })
    }

    const amount = Number(slip.amount)
    const transactionId = slip.transRef

    // ✅ กันสลิปซ้ำ (สำคัญสุด)
    const { data: used } = await supabase
      .from("used_slips")
      .select("*")
      .eq("transaction_id", transactionId)
      .single()

    if (used) {
      return res.status(400).json({ message: "slip already used" })
    }

    // ✅ เพิ่มเงิน
    await supabase.rpc("add_balance", {
      uid: userId,
      money: amount
    })

    // ✅ บันทึกสลิป
    await supabase.from("used_slips").insert({
      transaction_id: transactionId,
      amount
    })

    res.json({ success: true, amount })

  } catch (e) {
    console.error(e)
    res.status(500).json({ message: "server error" })
  }
}
