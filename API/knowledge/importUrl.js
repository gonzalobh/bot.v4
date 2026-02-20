export const config = {
  api: {
    bodyParser: false, // necesario para recibir archivos
  },
};

import formidable from "formidable";
import fs from "fs";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });

  try {
    // Parsear archivo recibido
    const form = formidable({ multiples: false });
    const [fields, files] = await form.parse(req);

    const file = files.file?.[0];
    const vectorStoreIdFromClient = fields.vectorStoreId?.[0];

    if (!file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }

    // ==========================================
    // 1️⃣ Crear vector store si no existe
    // ==========================================
    let vectorStoreId = vectorStoreIdFromClient;

    if (!vectorStoreId) {
      const vsResp = await fetch("https://api.openai.com/v1/vector_stores", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.TOMOSBOT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "bot-knowledge",
        }),
      });

      const vsData = await vsResp.json();
      vectorStoreId = vsData.id;
    }

    // ==========================================
    // 2️⃣ Subir archivo a OpenAI Files API
    // ==========================================
    const fileStream = fs.createReadStream(file.filepath);

    const formData = new FormData();
    formData.append("file", fileStream, file.originalFilename);
    formData.append("purpose", "assistants");

    const uploadResp = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.TOMOSBOT}`,
      },
      body: formData,
    });

    const uploadData = await uploadResp.json();

    // ==========================================
    // 3️⃣ Agregar archivo al vector store (indexa)
    // ==========================================
    await fetch(
      `https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.TOMOSBOT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_id: uploadData.id,
        }),
      }
    );

    // limpiar archivo temporal
    fs.unlinkSync(file.filepath);

    return res.status(200).json({
      ok: true,
      vectorStoreId,
      fileId: uploadData.id,
      filename: file.originalFilename,
    });

  } catch (err) {
    console.error("🔥 Upload error:", err);
    return res.status(500).json({ error: "Error subiendo archivo" });
  }
}
