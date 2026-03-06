export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { link } = req.body

  if (!link) {
    return res.status(400).json({ error: "No link provided" })
  }

  try {

    const response = await fetch("https://gift.truemoney.com/campaign/vouchers/" + link)

    const data = await response.json()

    res.status(200).json(data)

  } catch (err) {

    res.status(500).json({ error: "Redeem failed" })

  }

}
