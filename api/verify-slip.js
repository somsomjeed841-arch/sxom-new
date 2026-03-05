import { createClient } from "@supabase/supabase-js"
import formidable from "formidable"
import fs from "fs"
import FormData from "form-data"
import fetch from "node-fetch"

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  if (req.method !== "POST") {
    return res.status(405).end()
  }

  const form = new formidable.IncomingForm()

  form.parse(req, async (err, fields, files) => {
    try {
      const uid = fields.uid
      const file = files.files

      if (!file) {
        return res.status(400).json({ message: "no file" })
      }

      // ✅ ส่งไฟล์จริงไป SlipOK (แบบเดิม)
      const slipForm = new FormData()
      slipForm.append("files", fs.createReadStream(file.filepath))

      const response = await fetch(
        `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_KEY}`,
        {
          method: "POST",
          body: slipForm,
          headers: slipForm.getHeaders()
        }
      )

      const result = await response.json()
      console.log(result)

      if (result.code !== 1000) {
        return res.status(400).json({ message: "slip invalid" })
      }

      const amount = Number(result.data.amount)

      // ✅ เพิ่มเงินตรง ๆ (แบบบ้าน ๆ เหมือนเดิม)
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", uid)
        .single()

      const newBalance = (profile?.balance || 0) + amount

      await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", uid)

      return res.json({ success: true, amount })

    } catch (e) {
      console.error(e)
      return res.status(500).json({ message: "server error" })
    }
  })
}
