export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });

  // 🔹 ahora también recibimos vectorStoreId
  const { messages = [], system = "", vectorStoreId = "" } = req.body;

  // Tomamos el último mensaje del usuario
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find(m => m.role === "user");

  const userText = lastUserMessage?.content || "";

  console.log("🔵 Mensaje del usuario:", userText);

  // ================================
  // 🔎 BUSCAR CONOCIMIENTO (RAG)
  // ================================
  let knowledgeBlock = "";

  if (vectorStoreId && userText) {
    try {
      const searchResp = await fetch(
        `https://api.openai.com/v1/vector_stores/${vectorStoreId}/search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.TOMOSBOT}`,
          },
          body: JSON.stringify({
            query: userText,
            max_num_results: 5   // 🔥 esto controla los tokens (top-k)
          }),
        }
      );

      const searchData = await searchResp.json();

      if (searchResp.ok && searchData.data?.length) {
        const texts = searchData.data.map((r, i) => {
          const content = (r.content || [])
            .filter(p => p.type === "text")
            .map(p => p.text)
            .join("\n");

          return `#${i + 1}\n${content}`;
        });

        knowledgeBlock = texts.join("\n\n---\n\n");

        // 🔥 límite duro para que NUNCA crezca el prompt
        knowledgeBlock = knowledgeBlock.slice(0, 6000);
      }
    } catch (err) {
      console.warn("⚠️ Error buscando en vector store:", err);
    }
  }

  // ================================
  // 🧠 SYSTEM FINAL (con top-k)
  // ================================
  const systemFinal = `
${system}

${knowledgeBlock ? `
CONTEXTO RELEVANTE (usar solo si ayuda):
${knowledgeBlock}
` : ""}

REGLA DE IDIOMA (obligatorio):
- Detecta automáticamente el idioma del mensaje del usuario.
- Responde SIEMPRE en ese idioma.
- Si el usuario cambia de idioma, cambia tú también.
- Nunca mezcles idiomas.

Mensaje del usuario:
"${userText}"
`;

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.TOMOSBOT}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemFinal },
          ...messages
        ],
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
