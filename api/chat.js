export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { messages = [], system = "", vectorStoreId } = req.body;

  try {
    const tools = [];

    if (vectorStoreId) {
      tools.push({
        type: "file_search",
        vector_store_ids: [vectorStoreId],
      });
    }

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TOMOSBOT}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
        ...(tools.length ? { tools } : {}),
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("❌ OpenAI error:", data);
      return res.status(upstream.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Proxy error:", err);
    return res.status(500).json({ error: "Error interno del proxy" });
  }
}
