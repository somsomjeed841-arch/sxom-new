import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import fs from 'fs'
import FormData from 'form-data'
import fetch from 'node-fetch'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {

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
        return res.status(400).json({ message: 'Missing data' })
      }

      // 🔥 ส่งไฟล์ไป SlipOK
      const slipForm = new FormData()
      slipForm.append('files', fs.createReadStream(file.filepath))

      const slipResponse = await fetch(
        `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_KEY}`,
        {
          method: 'POST',
          body: slipForm,
          headers: slipForm.getHeaders()
        }
      )

      const result = await slipResponse.json()

      console.log('SLIP RESULT:', result)

      // ✅ สำคัญสุด (ของใหม่ต้องเช็ค code)
      if (result.code !== 1000) {
        return res.status(400).json({ message: 'Slip invalid' })
      }

      const amount = Number(result.data.amount)
      const transactionId = result.data.transaction_id

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      // 🔒 กันสลิปซ้ำ
      const { data: used } = await supabase
        .from('topups')
        .select('id')
        .eq('transaction_id', transactionId)
        .maybeSingle()

      if (used) {
        return res.status(400).json({ message: 'Slip already used' })
      }

      // 💰 อัปเดตเงิน
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', uid)
        .single()

      const newBalance = (profile?.balance || 0) + amount

      await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', uid)

      await supabase.from('topups').insert({
        user_id: uid,
        amount,
        transaction_id: transactionId
      })

      return res.status(200).json({ success: true, amount })

    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: e.message })
    }

  })
}
