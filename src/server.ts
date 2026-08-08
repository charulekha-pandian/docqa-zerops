import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { nanoid } from "nanoid";
import { initDb, pool } from "./db";
import { initIndex, indexChunks, searchChunks } from "./search";
import { uploadFile } from "./storage";
import { chunkText } from "./chunk";

const app = new Hono();

await initDb();
await initIndex();

app.use("/*", serveStatic({ root: "./public" }));

// Upload a document: store raw file, chunk the text, index chunks for search.
app.post("/api/documents", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file") as File | null;
  if (!file) return c.json({ error: "file is required" }, 400);

  const id = nanoid();
  const buf = Buffer.from(await file.arrayBuffer());
  const text = await extractText(file.name, buf);
  const chunks = chunkText(text);

  await uploadFile(`${id}-${file.name}`, buf, file.type || "application/octet-stream");
  await indexChunks(id, file.name, chunks);
  await pool.query(
    "INSERT INTO documents (id, filename, storage_key, chunk_count) VALUES ($1, $2, $3, $4)",
    [id, file.name, `${id}-${file.name}`, chunks.length]
  );

  return c.json({ id, filename: file.name, chunks: chunks.length });
});

app.get("/api/documents", async (c) => {
  const { rows } = await pool.query(
    "SELECT id, filename, chunk_count, created_at FROM documents ORDER BY created_at DESC"
  );
  return c.json(rows);
});

// Ask a question: retrieve relevant chunks via BM25, ask Groq to answer using only those.
app.post("/api/ask", async (c) => {
  const { question } = await c.req.json();
  if (!question) return c.json({ error: "question is required" }, 400);

  const hits = await searchChunks(question, 8);
  if (hits.length === 0) {
    return c.json({ answer: "No documents indexed yet — upload one first.", sources: [] });
  }

  const context = hits
    .map((h, i) => `[${i + 1}] (${h.filename})\n${h.text}`)
    .join("\n\n");

  const systemPrompt = `You are a careful research assistant answering questions strictly from the provided document excerpts.

Rules:
- Answer using ONLY the excerpts given. Never use outside knowledge.
- Write a direct, complete answer in 2-5 sentences — don't just restate the excerpts, synthesize them into a clear answer.
- Cite the excerpt number(s) that support each claim, like [1] or [1][3], placed right after the relevant statement.
- If multiple excerpts disagree or come from unrelated topics, say so explicitly rather than blending them into one answer.
- If the excerpts don't contain enough information to answer, say exactly what's missing rather than guessing.
- Do not pad the answer with meta-commentary about the excerpts themselves — answer the question first.`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 700,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Excerpts:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    return c.json({ error: `Groq API error: ${errText}` }, 500);
  }

  const groqData = await groqRes.json();
  const answer = groqData.choices?.[0]?.message?.content ?? "";
  return c.json({
    answer,
    sources: hits.map((h) => ({ filename: h.filename, snippet: h.text.slice(0, 160) })),
  });
});

async function extractText(filename: string, buf: Buffer): Promise<string> {
  if (filename.toLowerCase().endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buf);
    return parsed.text;
  }
  return buf.toString("utf-8");
}

export default app;