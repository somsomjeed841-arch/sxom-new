const { createClient } = require('@supabase/supabase-js')
const formidable = require('formidable')
const fs = require('fs')
const FormData = require('form-data')
const fetch = require('node-fetch')

module.exports.config = {
  api: { bodyParser: false },
}

module.exports = async function handler(req, res) {

  console.log("===== START VERIFY =====")

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new formidable.IncomingForm({ multiples: true })

  form.parse(req, async (err, fields, files) => {

    try {

      console.log("FIELDS:", fields)
      console.log("FILES:", files)

      if (err) {
        return res.status(500).json({ error: err.message })
      }

      const uid = fields.uid?.[0] || fields.uid

      // 🔥 แก้ตรงนี้สำคัญสุด
      let file = files.files || files.file
      if (Array.isArray(file)) file = file[0]

      if (!uid) return res.status(400).json({ error: 'NO UID' })
      if (!file) return res.status(400).json({ error: 'NO FILE' })

      console.log("FILEPATH:", file.filepath)

      const slipForm = new FormData()
      slipForm.append("files", fs.createReadStream(file.filepath))

      console.log("CALLING SLIPOK...")

      const slipResponse = await fetch(
        `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_KEY}`,
        {
          method: "POST",
          body: slipForm,
          headers: slipForm.getHeaders()
        }
      )

      const result = await slipResponse.json()

      console.log("SLIP RESULT:", result)

      if (!result.success) {
        return res.status(400).json(result)
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
        return res.status(400).json({ message: "Slip already used" })
      }

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

      return res.status(200).json({ success: true })

    } catch (error) {
      console.error("SERVER ERROR:", error)
      return res.status(500).json({ error: error.message })
    }

  })
}
