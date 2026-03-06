import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { user_id, amount } = req.body

  try {

    const { data, error } = await supabase
      .from("users")
      .update({
        balance: supabase.raw(`balance + ${amount}`)
      })
      .eq("id", user_id)

    if (error) throw error

    res.status(200).json({ success: true })

  } catch (err) {

    res.status(500).json({ error: "Update balance failed" })

  }

}
