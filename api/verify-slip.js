const { createClient } = require('@supabase/supabase-js')
const formidable = require('formidable')
const fs = require('fs')
const FormData = require('form-data')
const fetch = require('node-fetch')

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new formidable.IncomingForm({
    multiples: false,
    keepExtensions: true
  })

  form.parse(req, async (err, fields, files) => {

    try {

      if (err) {
        console.error(err)
        return res.status(500).json({ error: 'Form parse error' })
      }

      const uid = fields.uid?.[0] || fields.uid

      let file = files.files || files.file || Object.values(files)[0]
      if (Array.isArray(file)) file = file[0]

      if (!uid || !file) {
        return res.status(400).json({ error: 'Missing data' })
      }

      const filePath = file.filepath || file.path

      const slipForm = new FormData()
      slipForm.append("files", fs.createReadStream(filePath))

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

      if (result.code !== 1000 || !result.data) {
        return res.status(400).json({ message: "Slip invalid" })
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
        return res.status(400).json({ message: "Slip already used" })
      }

      // ใช้ increment กันโกง race condition
      await supabase.rpc('increment_balance', {
        uid_input: uid,
        amount_input: amount
      })

      await supabase.from("topups").insert({
        user_id: uid,
        amount,
        transaction_id: transactionId
      })

      return res.status(200).json({ success: true })

    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: error.message })
    }

  })
}
