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

async function openAiDelete(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.TOMOSBOT}`,
      "OpenAI-Beta": "assistants=v2",
      ...(options.headers || {}),
    },
  });

  const payload = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });

  try {
    const body = await readJson(req);
    if (!body) return res.status(400).json({ ok: false, error: "Invalid JSON body" });

    const { openaiFileId, vectorStoreId } = body;

    if (!openaiFileId) return res.status(400).json({ ok: false, error: "Missing openaiFileId" });

    let detach = { ok: true, skipped: true };
    if (vectorStoreId) {
      detach = await openAiDelete(
        `https://api.openai.com/v1/vector_stores/${vectorStoreId}/files/${openaiFileId}`,
        { method: "DELETE" }
      );
    }

    const removeFile = await openAiDelete(`https://api.openai.com/v1/files/${openaiFileId}`, {
      method: "DELETE",
    });

    const ok = (!!detach.ok || !!detach.skipped) && removeFile.ok;

    return res.status(ok ? 200 : 207).json({
      ok,
      openaiFileId,
      detach,
      removeFile,
    });
  } catch (err) {
    console.error("KNOWLEDGE DELETE ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "Delete failed",
      message: err?.message || "Unknown error",
    });
  }
}
