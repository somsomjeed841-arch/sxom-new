const { createClient } = require('@supabase/supabase-js')
const formidable = require('formidable')
const fs = require('fs')
const FormData = require('form-data')
const fetch = require('node-fetch')

module.exports.config = {
  api: {
    bodyParser: false,
  },
}

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new formidable.IncomingForm()

  form.parse(req, async (err, fields, files) => {

    try {

      if (err) {
        return res.status(500).json({ error: 'Form parse error' })
      }

      const uid = fields.uid
      const file = files.file   // ✅ แก้ตรงนี้

      if (!uid || !file) {
        return res.status(400).json({ error: 'Missing data' })
      }

      const slipForm = new FormData()
      slipForm.append("file", fs.createReadStream(file.filepath)) // ✅ แก้ตรงนี้
      slipForm.append("log", "true")

      const slipResponse = await fetch(
        `https://api.slipok.com/api/line/apikey/61738}`,
        {
          method: "POST",
          body: slipForm,
          headers: slipForm.getHeaders()
        }
      )

      const result = await slipResponse.json()

      console.log("SlipOK response:", result) // 🔥 เผื่อดู log

      if (!result.success) {
        return res.status(400).json({ success:false, message: result })
      }

      const amount = Number(result.data.amount)
      const transactionId = result.data.transaction_id

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      const { data: existing } = await supabase
        .from("topups")
        .select("id")
        .eq("transaction_id", transactionId)
        .maybeSingle()

      if (existing) {
        return res.status(400).json({ success:false, message:"Slip already used" })
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", uid)
        .single()

      const oldBalance = profile?.balance || 0
      const newBalance = oldBalance + amount

      await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", uid)

      await supabase
        .from("topups")
        .insert([{
          user_id: uid,
          amount: amount,
          transaction_id: transactionId
        }])

      return res.status(200).json({ success:true })

    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: error.message })
    }

  })
}
