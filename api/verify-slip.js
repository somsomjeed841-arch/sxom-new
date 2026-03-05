const { createClient } = require('@supabase/supabase-js')
const formidable = require('formidable')
const fs = require('fs')
const FormData = require('form-data')
const fetch = require('node-fetch')

/* ✅ สำคัญสำหรับ Vercel */
module.exports.config = {
  api: {
    bodyParser: false,
  },
}

module.exports = async function handler(req, res) {

  /* ===============================
     METHOD CHECK
  =============================== */
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new formidable.IncomingForm({
    multiples: false,
  })

  form.parse(req, async (err, fields, files) => {

    try {

      if (err) {
        console.error("Form parse error:", err)
        return res.status(500).json({ error: 'Form parse error' })
      }

      /* ===============================
         GET DATA
      =============================== */
      const uid = fields.uid

      // ✅ รองรับทั้ง file เดี่ยว และ array
      const uploadedFile = Array.isArray(files.file)
        ? files.file[0]
        : files.file

      if (!uid || !uploadedFile) {
        return res.status(400).json({ error: 'Missing data' })
      }

      console.log("UID:", uid)
      console.log("File path:", uploadedFile.path)

      /* ===============================
         SEND TO SLIPOK
      =============================== */
      const slipForm = new FormData()

      // ✅ ใช้ path เท่านั้น (Vercel ไม่มี filepath)
      slipForm.append("file", fs.createReadStream(uploadedFile.path))
      slipForm.append("log", "true")

      const slipResponse = await fetch(
        `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_KEY}`,
        {
          method: "POST",
          body: slipForm,
          headers: slipForm.getHeaders()
        }
      )

      const result = await slipResponse.json()

      console.log("SlipOK response:", result)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result
        })
      }

      /* ===============================
         EXTRACT DATA
      =============================== */
      const amount = Number(result.data.amount)
      const transactionId = result.data.transaction_id

      /* ===============================
         SUPABASE
      =============================== */
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      /* กันสลิปซ้ำ */
      const { data: existing } = await supabase
        .from("topups")
        .select("id")
        .eq("transaction_id", transactionId)
        .maybeSingle()

      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Slip already used"
        })
      }

      /* ดึง balance */
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", uid)
        .single()

      const oldBalance = profile?.balance || 0
      const newBalance = oldBalance + amount

      /* อัปเดต balance */
      await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", uid)

      /* บันทึก topup */
      await supabase
        .from("topups")
        .insert([{
          user_id: uid,
          amount: amount,
          transaction_id: transactionId
        }])

      /* ===============================
         SUCCESS
      =============================== */
      return res.status(200).json({
        success: true,
        amount
      })

    } catch (error) {

      console.error("SERVER ERROR:", error)

      return res.status(500).json({
        error: error.message
      })
    }

  })
}
