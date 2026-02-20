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

    // Tomamos el último mensaje del usuario
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find(m => m.role === "user");

    const userText = lastUserMessage?.content || "";

    console.log("User message:", userText);
    console.log("VectorStore:", vectorStoreId);

    // Nueva llamada compatible con Retrieval
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TOMOSBOT}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",

        input: userText,

        instructions: system,

        ...(vectorStoreId
          ? {
              tools: [{
                type: "file_search",
                vector_store_ids: [vectorStoreId],
              }]
            }
          : {})
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("OpenAI error:", data);
      return res.status(upstream.status).json(data);
    }

    // Adaptamos formato para que el frontend no cambie nada
    const text =
      data.output?.[0]?.content?.[0]?.text ||
      "No response";

    return res.status(200).json({
      choices: [{
        message: { content: text }
      }]
    });
  } catch (err) {
    console.error("🔥 Proxy error:", err);
    return res.status(500).json({ error: "Error interno del proxy" });
  }
}
