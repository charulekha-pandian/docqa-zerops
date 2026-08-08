# 📚 DocQuery — Reading Room

![Platform](https://img.shields.io/badge/platform-Zerops-2B5D5A) ![DB](https://img.shields.io/badge/db-PostgreSQL-336791) ![Search](https://img.shields.io/badge/search-Elasticsearch-005571) ![Stack](https://img.shields.io/badge/stack-Bun%20%2B%20Hono-000000) ![LLM](https://img.shields.io/badge/llm-Groq%20Llama%203.3-orange)

A grounded document Q&A tool — upload a document, ask questions about it, and get answers cited back to the exact passage they came from. Every chat keeps its own documents and history, so nothing leaks between sessions. Built for the Zerops Challenge hackathon, deployed entirely on Zerops-managed infrastructure.

---

## ⚡ Key Features

- **Grounded answers only** — the model is instructed to answer strictly from retrieved excerpts, and to say explicitly when the documents don't contain enough information rather than guessing.
- **Inline citations** — every answer cites the excerpt number(s) it drew from, rendered as index-card style source snippets so you can verify the claim yourself.
- **Per-chat sessions** — each chat has its own uploaded documents and its own saved question/answer history, styled as a reading-room sidebar. Switching chats never mixes context.
- **Real multi-service architecture** — Postgres for metadata, Elasticsearch for BM25 retrieval, S3-compatible object storage for the raw files, all wired together over Zerops's private network.
- **No vector database required** — retrieval uses Elasticsearch's BM25 keyword search over chunked document text, avoiding an unnecessary embeddings dependency while still demonstrating the full retrieval-augmented-generation pattern.

---

## 🏗️ Architecture

| Layer | Technology | Role |
|---|---|---|
| Runtime | Bun + Hono | API service handling upload, ask, and session routes |
| Metadata | PostgreSQL | Sessions, documents, and saved Q&A history |
| Retrieval | Elasticsearch | Chunked document text, BM25 search, scoped per session |
| File storage | Object storage (S3-compatible) | Original uploaded files |
| Generation | Groq — Llama 3.3 70B | Answers questions strictly from retrieved excerpts |

All services run on Zerops and communicate over its private network (`db:5432`, `elastic:9200`), wired together via `zerops.yaml`.

**Flow:** upload → text extracted & chunked → chunks indexed in Elasticsearch, scoped to the session → question asked → top chunks retrieved via BM25 → sent as context to Groq → answer returned with citations → question, answer, and sources saved to Postgres for that session's history.

---

## 🚀 Local setup

```bash
bun install
```

Create a `.env` file:
```
GROQ_API_KEY=your-groq-api-key
```

```bash
bun run dev
```

> `DATABASE_URL` and `ES_URL` point at Zerops's private network hostnames, so local runs of upload/ask won't fully work until deployed — that's expected.

---

## ☁️ Deploying on Zerops

1. Create a Zerops project.
2. Provision three services: `db` (Postgres 16), `elastic` (Elasticsearch), `storage` (object storage). See `zerops-project-import.yml` for reference.
3. Add an `api` service pointed at this repo — Zerops reads `zerops.yaml` and deploys automatically.
4. Set `GROQ_API_KEY` as a secret variable on the `api` service.
   (`DATABASE_URL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` are auto-injected by Zerops when services are named as above.)

---

## 🔌 API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all chat sessions |
| `POST` | `/api/sessions` | Create a new chat session |
| `GET` | `/api/sessions/:id` | Get a session's documents + message history |
| `DELETE` | `/api/sessions/:id` | Delete a session and everything in it |
| `POST` | `/api/sessions/:id/documents` | Upload a document into a session (multipart, field `file`) |
| `POST` | `/api/sessions/:id/ask` | Ask a question scoped to a session's documents |

---

## 🤖 AI tools used

I used Claude (Anthropic) to help scaffold and build this project. Specifically:
- Got help debugging setup issues along the way (Bun installation, Git/GitHub authentication, environment variables)
- Redesigned the frontend and added per-chat sessions with Claude's help