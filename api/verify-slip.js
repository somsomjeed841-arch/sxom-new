const { createClient } = require('@supabase/supabase-js')
const formidable = require('formidable')
const fs = require('fs')
const FormData = require('form-data')
const fetch = require('node-fetch')

module.exports.config = {
  api: { bodyParser: false },
}

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new formidable.IncomingForm({ multiples: true })

  form.parse(req, async (err, fields, files) => {

    try {

      if (err) return res.status(500).json({ error: err.message })

      const uid = fields.uid?.[0] || fields.uid

      let file = files.files || files.file
      if (Array.isArray(file)) file = file[0]

      if (!uid || !file) {
        return res.status(400).json({ error: 'Missing data' })
      }

      const slipForm = new FormData()
      slipForm.append("files", fs.createReadStream(file.filepath))

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

      // 🔥 กันพัง + เช็คให้ครบ
      if (result.code !== 1000 || !result.data) {
        return res.status(400).json({
          message: "Slip invalid",
          result
        })
      }

      const amount = Number(result.data.amount || 0)
      const transactionId = result.data.transaction_id

      if (!transactionId) {
        return res.status(400).json({ message: "No transaction id" })
      }

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
