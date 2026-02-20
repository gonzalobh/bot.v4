export const config = { runtime: "nodejs" };

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });

  try {
    const body = await readJson(req);
    if (!body) return res.status(400).json({ ok: false, error: "Invalid JSON body" });

    const { fileUrl, filename, vectorStoreId, empresa, bot, storagePath } = body;

    if (!fileUrl) return res.status(400).json({ ok: false, error: "Missing fileUrl" });
    if (!empresa) return res.status(400).json({ ok: false, error: "Missing empresa" });
    if (!bot) return res.status(400).json({ ok: false, error: "Missing bot" });

    let finalVectorStoreId = vectorStoreId || "";

    console.log("Importing file:", filename);
    console.log("URL:", fileUrl);
    console.log("empresa/bot:", empresa, bot);

    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) {
      return res.status(400).json({ ok: false, error: "No se pudo descargar el archivo subido" });
    }
    const buffer = await fileResp.arrayBuffer();

    const fd = new FormData();
    fd.append("file", new Blob([buffer]), filename || "document.txt");
    fd.append("purpose", "assistants");

    const upload = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TOMOSBOT}` },
      body: fd,
    });

    const uploaded = await upload.json().catch(() => ({}));
    if (!upload.ok || !uploaded?.id) {
      console.error("OpenAI upload error:", uploaded);
      return res.status(upload.status || 500).json({
        ok: false,
        error: "OpenAI file upload failed",
        details: uploaded,
      });
    }

    if (!finalVectorStoreId) {
      const createdVsResp = await fetch("https://api.openai.com/v1/vector_stores", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TOMOSBOT}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({ name: `tomosbot-${empresa}-${bot}` }),
      });

      const createdVs = await createdVsResp.json().catch(() => ({}));
      if (!createdVsResp.ok || !createdVs?.id) {
        console.error("Vector store create error:", createdVs);
        return res.status(createdVsResp.status || 500).json({
          ok: false,
          error: "No se pudo crear vector store",
          details: createdVs,
        });
      }
      finalVectorStoreId = createdVs.id;
      console.log("Created vector store:", finalVectorStoreId);
    }

    const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${finalVectorStoreId}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TOMOSBOT}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ file_id: uploaded.id }),
    });

    const attachData = await attachResp.json().catch(() => ({}));
    if (!attachResp.ok) {
      console.error("Vector store attach error:", attachData);
      return res.status(attachResp.status || 500).json({
        ok: false,
        error: "No se pudo adjuntar archivo al vector store",
        vectorStoreId: finalVectorStoreId,
        openaiFileId: uploaded.id,
        details: attachData,
      });
    }

    return res.status(200).json({
      ok: true,
      vectorStoreId: finalVectorStoreId,
      openaiFileId: uploaded.id,
      vectorStoreFileId: attachData?.id || null,
      filename: filename || uploaded?.filename || "document.txt",
      storagePath: storagePath || "",
      attach: attachData,
    });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "Import failed",
      message: err?.message || "Unknown error",
    });
  }
}
