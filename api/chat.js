export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });

  // Recibir datos
  const { messages = [], system = "" } = req.body;

  // Tomamos el ÚLTIMO mensaje del usuario
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find(m => m.role === "user");

  const userText = lastUserMessage?.content || "";

  // 🔵 LOG
  console.log("🔵 Mensaje del usuario:", userText);

  // 🟢 Nuevo system prompt unificado
  const systemFinal = `
${system}

REGLA DE IDIOMA (obligatorio):
- Detecta automáticamente el idioma del mensaje del usuario.
- Responde SIEMPRE en el mismo idioma que el mensaje reciente del usuario.
- Si el usuario cambia de idioma, cambia tú también.
- Nunca mezcles idiomas.
- Mantén el estilo, tono y reglas del prompt original del bot.

Mensaje del usuario para detección de idioma:
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
