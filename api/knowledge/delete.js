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

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.TOMOSBOT}`,
      ...(options.headers || {}),
    },
  });

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = payload?.error?.message || payload?.message || `OpenAI request failed (${resp.status})`;
    throw new Error(message);
  }

  return payload;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { filename, vectorStoreId } = await readJson(req);

    if (!filename) return res.status(400).json({ error: "Missing filename" });
    if (!vectorStoreId) return res.status(400).json({ error: "Missing vectorStoreId" });

    const filesList = await apiFetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`);
    const files = Array.isArray(filesList?.data) ? filesList.data : [];

    let matchedFile = null;

    for (const fileEntry of files) {
      if (!fileEntry?.id || !fileEntry?.file_id) continue;
      const fileData = await apiFetch(`https://api.openai.com/v1/files/${fileEntry.file_id}`);
      if (fileData?.filename === filename) {
        matchedFile = { vectorStoreFileId: fileEntry.id, fileId: fileEntry.file_id };
        break;
      }
    }

    if (!matchedFile?.fileId) {
      return res.json({ ok: true, removed: false, message: "File not found in vector store" });
    }

    await apiFetch(`https://api.openai.com/v1/files/${matchedFile.fileId}`, { method: "DELETE" });
    await apiFetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files/${matchedFile.vectorStoreFileId}`, { method: "DELETE" });

    return res.json({ ok: true, removed: true, fileId: matchedFile.fileId });
  } catch (err) {
    console.error("KNOWLEDGE DELETE ERROR:", err);
    return res.status(500).json({
      error: "Delete failed",
      message: err?.message || "Unknown error",
    });
  }
}
