import { createClient } from "@supabase/supabase-js"
import formidable from "formidable"
import fs from "fs"
import FormData from "form-data"
import fetch from "node-fetch"

export const config = {
  api: { bodyParser: false }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" })
  }

  const form = new formidable.IncomingForm()

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) return res.status(500).json({ message: "form error" })

      const userId = fields.userId
      const file = files.files

      if (!file) {
        return res.status(400).json({ message: "no file" })
      }

      // ✅ ส่งไฟล์จริงไป SlipOK
      const slipForm = new FormData()
      slipForm.append("files", fs.createReadStream(file.filepath))
      slipForm.append("log", "true")

      const response = await fetch(
        `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_KEY}`,
        {
          method: "POST",
          body: slipForm,
          headers: slipForm.getHeaders()
        }
      )

      const result = await response.json()

      console.log("SLIP RESULT:", result)

      if (result.code !== 1000) {
        return res.status(400).json({ message: "slip invalid" })
      }

      const amount = Number(result.data.amount)
      const transactionId = result.data.transRef

      // ✅ กันสลิปซ้ำ
      const { data: used } = await supabase
        .from("used_slips")
        .select("id")
        .eq("transaction_id", transactionId)
        .maybeSingle()

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

      return res.json({ success: true, amount })

    } catch (e) {
      console.error(e)
      return res.status(500).json({ message: e.message })
    }
  })
}
