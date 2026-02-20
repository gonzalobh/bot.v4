export const config = { runtime: "nodejs" };

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { fileUrl, filename, vectorStoreId } = await readJson(req);

    let finalVectorStoreId = vectorStoreId || "";

    if (!fileUrl) return res.status(400).json({ error: "Missing fileUrl" });

    // Descargar archivo desde Firebase
    console.log("Importing file:", filename);
    console.log("URL:", fileUrl);
    const fileResp = await fetch(fileUrl);
    const buffer = await fileResp.arrayBuffer();

    // Subir a OpenAI Files API
    const fd = new FormData();
    fd.append("file", new Blob([buffer]), filename || "document.txt");
    fd.append("purpose", "assistants");

    const upload = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TOMOSBOT}` },
      body: fd,
    });

    const uploaded = await upload.json();
    console.log("Uploaded to OpenAI:", uploaded.id);

    if (!finalVectorStoreId) {
      const createdVsResp = await fetch("https://api.openai.com/v1/vector_stores", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TOMOSBOT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "tomosbot-knowledge" }),
      });

      const createdVs = await createdVsResp.json();
      if (!createdVsResp.ok || !createdVs?.id) {
        throw new Error(createdVs?.error?.message || createdVs?.message || "No se pudo crear vector store");
      }
      finalVectorStoreId = createdVs.id;
      console.log("Created vector store:", finalVectorStoreId);
    }

    // Asociar al vector store
    await fetch(`https://api.openai.com/v1/vector_stores/${finalVectorStoreId}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TOMOSBOT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_id: uploaded.id }),
    });
    console.log("Linked to vector store:", finalVectorStoreId);

    return res.json({ ok: true, vectorStoreId: finalVectorStoreId });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    return res.status(500).json({
      error: "Import failed",
      message: err.message,
    });
  }
}
