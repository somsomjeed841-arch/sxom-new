export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {

    const response = await fetch(
      "https://api.slipok.com/api/line/apikey/61738",
      {
        method: "POST",
        headers: {
          "x-authorization": process.env.SLIPOK0IHUY7U,
        },
        body: req.body,
      }
    );

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
