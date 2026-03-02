const formidable = require("formidable");
const fs = require("fs");
const FormData = require("form-data");
const fetch = require("node-fetch");

export const config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {

    if (err) {
      return res.status(500).json({ error: "Upload error" });
    }

    try {

      // 🔥 ดึงไฟล์แบบกันพลาด 100%
      const fileKey = Object.keys(files)[0];

      if (!fileKey) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = files[fileKey][0];

      const formData = new FormData();
      formData.append("files", fs.createReadStream(file.filepath));
      formData.append("log", "true");

      const response = await fetch(
        "https://api.slipok.com/api/line/apikey/61738",
        {
          method: "POST",
          headers: {
            "x-authorization": process.env.SLIPOK_KEY,
            ...formData.getHeaders(),
          },
          body: formData,
        }
      );

      const data = await response.json();

      return res.status(200).json(data);

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

  });
};
