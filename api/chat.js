function normalizeMessageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

function extractSnippet(result = {}) {
  const fromContent = Array.isArray(result?.content)
    ? result.content
        .map((part) => {
          if (typeof part?.text === "string") return part.text;
          if (typeof part?.content === "string") return part.content;
          if (typeof part === "string") return part;
          return "";
        })
        .join(" ")
    : "";

  return (
    fromContent ||
    result?.text ||
    result?.snippet ||
    result?.chunk ||
    result?.document ||
    ""
  )
    .toString()
    .replace(/\s+/g, " ")
    .trim();
}

function buildKnowledgeBlock(results = [], maxChars = 1600) {
  const snippets = [];
  let usedChars = 0;

  for (const item of results) {
    const snippet = extractSnippet(item);
    if (!snippet) continue;

    const next = `- ${snippet}`;
    if (usedChars + next.length > maxChars) break;

    snippets.push(next);
    usedChars += next.length;
  }

  if (!snippets.length) return "";

  return [
    "Contexto recuperado de la base de conocimiento:",
    snippets.join("\n"),
    "Usa este contexto solo si aplica a la pregunta del usuario.",
  ].join("\n");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { messages = [], system = "", vectorStoreId = "" } = req.body || {};
  const debugEnabled = process.env.NODE_ENV !== "production" || req.query?.debug === "1";

  try {
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m?.role === "user");

    const userText = normalizeMessageText(lastUserMessage?.content);

    console.log("User message:", userText);
    console.log("VectorStoreId:", vectorStoreId);

    let searchResults = [];

    if (vectorStoreId && userText) {
      const searchResp = await fetch(
        `https://api.openai.com/v1/vector_stores/${vectorStoreId}/search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.TOMOSBOT}`,
            "OpenAI-Beta": "assistants=v2",
          },
          body: JSON.stringify({ query: userText, top_k: 6 }),
        }
      );

      console.log("Search status:", searchResp.status);

      const searchData = await searchResp.json().catch(() => ({}));
      if (!searchResp.ok) {
        console.log("Vector search error:", searchData);
      }

      const results = Array.isArray(searchData?.data)
        ? searchData.data
        : Array.isArray(searchData?.results)
        ? searchData.results
        : [];

      console.log("Search results count:", results.length);
      searchResults = results;
    }

    const knowledgeBlock = buildKnowledgeBlock(searchResults);
    const finalSystem = knowledgeBlock
      ? `${system}\n\n${knowledgeBlock}`.trim()
      : (system || "").trim();

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TOMOSBOT}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: userText,
        instructions: finalSystem,
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error("OpenAI error:", data);
      return res.status(upstream.status).json(data);
    }

    const text = data.output?.[0]?.content?.[0]?.text || "No response";

    const payload = {
      choices: [{
        message: { content: text },
      }],
    };

    if (debugEnabled) {
      payload.rag = { used: !!knowledgeBlock, results: searchResults.length };
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("🔥 Proxy error:", err);
    return res.status(500).json({ error: "Error interno del proxy" });
  }
}
