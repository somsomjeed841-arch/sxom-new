export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { slip_image } = req.body

  try {

    const response = await fetch("https://api.slipok.com/api/line/apikey/" + process.env.SLIPOK_KEY, {
      method: "POST",
      body: JSON.stringify({
        data: slip_image
      }),
      headers: {
        "Content-Type": "application/json"
      }
    })

    const data = await response.json()

    res.status(200).json(data)

  } catch (err) {

    res.status(500).json({ error: "Slip verify failed" })

  }

}
