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

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {

    if (err) {
      return res.status(500).json({ error: "Upload error" });
    }

    try {

      const file = files.files;

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
      res.status(200).json(data);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }

  });
};
