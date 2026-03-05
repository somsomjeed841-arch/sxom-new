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
        console.error(err)
        return res.status(500).json({ error: 'Form parse error' })
      }

      const uid = fields.uid
      const file = files.file   // ต้องชื่อ file ตรงกับ frontend

      if (!uid || !file) {
        return res.status(400).json({ error: 'Missing data' })
      }

      const slipForm = new FormData()
      slipForm.append("file", fs.createReadStream(file.filepath))
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

      console.log("SlipOK:", result)

      if (!result.success) {
        return res.status(400).json({ success:false })
      }

      const amount = Number(result.data.amount)
      const transactionId = result.data.transaction_id

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      // กันสลิปซ้ำ
      const { data: existing } = await supabase
        .from("topups")
        .select("id")
        .eq("transaction_id", transactionId)
        .maybeSingle()

      if (existing) {
        return res.status(400).json({ success:false, message:"Slip already used" })
      }

      // เพิ่มเงินแบบ atomic
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

      await supabase
        .from("topups")
        .insert([{
          user_id: uid,
          amount,
          transaction_id: transactionId
        }])

      return res.status(200).json({ success:true })

    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: error.message })
    }

  })
}
