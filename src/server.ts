import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { nanoid } from "nanoid";
import { initDb, pool } from "./db";
import { initIndex, indexChunks, searchChunks, deleteSessionChunks } from "./search";
import { uploadFile } from "./storage";
import { chunkText } from "./chunk";

const app = new Hono();

await initDb();
await initIndex();

app.use("/*", serveStatic({ root: "./public" }));

// ---------- Sessions ----------

app.get("/api/sessions", async (c) => {
  const { rows } = await pool.query(
    "SELECT id, title, created_at FROM sessions ORDER BY created_at DESC"
  );
  return c.json(rows);
});

app.post("/api/sessions", async (c) => {
  const id = nanoid();
  await pool.query("INSERT INTO sessions (id, title) VALUES ($1, $2)", [id, "New chat"]);
  return c.json({ id, title: "New chat" });
});

app.get("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const session = await pool.query("SELECT id, title, created_at FROM sessions WHERE id = $1", [id]);
  if (session.rows.length === 0) return c.json({ error: "session not found" }, 404);

  const documents = await pool.query(
    "SELECT id, filename, chunk_count, created_at FROM documents WHERE session_id = $1 ORDER BY created_at ASC",
    [id]
  );
  const messages = await pool.query(
    "SELECT id, question, answer, sources, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC",
    [id]
  );

  return c.json({
    session: session.rows[0],
    documents: documents.rows,
    messages: messages.rows,
  });
});

app.delete("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  await deleteSessionChunks(id);
  await pool.query("DELETE FROM sessions WHERE id = $1", [id]); // cascades to documents + messages
  return c.json({ deleted: true });
});

// ---------- Documents (scoped to a session) ----------

app.post("/api/sessions/:id/documents", async (c) => {
  const sessionId = c.req.param("id");
  const sessionCheck = await pool.query("SELECT id FROM sessions WHERE id = $1", [sessionId]);
  if (sessionCheck.rows.length === 0) return c.json({ error: "session not found" }, 404);

  const form = await c.req.formData();
  const file = form.get("file") as File | null;
  if (!file) return c.json({ error: "file is required" }, 400);

  const id = nanoid();
  const buf = Buffer.from(await file.arrayBuffer());
  const text = await extractText(file.name, buf);
  const chunks = chunkText(text);

  await uploadFile(`${id}-${file.name}`, buf, file.type || "application/octet-stream");
  await indexChunks(id, sessionId, file.name, chunks);
  await pool.query(
    "INSERT INTO documents (id, session_id, filename, storage_key, chunk_count) VALUES ($1, $2, $3, $4, $5)",
    [id, sessionId, file.name, `${id}-${file.name}`, chunks.length]
  );

  return c.json({ id, filename: file.name, chunks: chunks.length });
});

// ---------- Ask (scoped to a session) ----------

app.post("/api/sessions/:id/ask", async (c) => {
  const sessionId = c.req.param("id");
  const sessionRow = await pool.query("SELECT id, title FROM sessions WHERE id = $1", [sessionId]);
  if (sessionRow.rows.length === 0) return c.json({ error: "session not found" }, 404);

  const { question } = await c.req.json();
  if (!question) return c.json({ error: "question is required" }, 400);

  const hits = await searchChunks(question, sessionId, 8);
  if (hits.length === 0) {
    const answer = "No documents in this chat yet — file one first.";
    return c.json({ answer, sources: [] });
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
        { role: "user", content: `Excerpts:\n${context}\n\nQuestion: ${question}` },
      ],
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    return c.json({ error: `Groq API error: ${errText}` }, 500);
  }

  const groqData = await groqRes.json();
  const answer = groqData.choices?.[0]?.message?.content ?? "";
  const sources = hits.map((h) => ({ filename: h.filename, snippet: h.text.slice(0, 160) }));

  const messageId = nanoid();
  await pool.query(
    "INSERT INTO messages (id, session_id, question, answer, sources) VALUES ($1, $2, $3, $4, $5)",
    [messageId, sessionId, question, answer, JSON.stringify(sources)]
  );

  // Auto-title the session from the first question, if it's still untitled.
  if (sessionRow.rows[0].title === "New chat") {
    const title = question.length > 60 ? question.slice(0, 57) + "..." : question;
    await pool.query("UPDATE sessions SET title = $1 WHERE id = $2", [title, sessionId]);
  }

  return c.json({ answer, sources });
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