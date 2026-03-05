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

  const form = new formidable.IncomingForm()

  form.parse(req, async (err, fields, files) => {
    try {

      if (err) return res.status(500).json({ error: 'Form parse error' })

      const uid = fields.uid
      const file = files.files?.[0] // ⭐ แก้ตรงนี้

      if (!uid || !file?.filepath) {
        return res.status(400).json({ error: 'Missing file or uid' })
      }

      const slipForm = new FormData()
      slipForm.append("files", fs.createReadStream(file.filepath))
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
      console.log("SLIP RESULT:", result)

      if (result.code !== 1000) {
        return res.status(400).json({ success:false, result })
      }

      const slipData = result.data?.slip || result.data
      const amount = Number(slipData.amount)
      const transactionId = slipData.transaction_id

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
        return res.status(400).json({ message:"Slip already used" })
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", uid)
        .single()

      const newBalance = (profile?.balance || 0) + amount

      await supabase.from("profiles").update({ balance: newBalance }).eq("id", uid)

      await supabase.from("topups").insert([{
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
