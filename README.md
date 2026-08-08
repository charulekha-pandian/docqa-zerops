# DocQuery

Upload a document, ask questions about it, get answers grounded in the
actual text with citations — built for the Zerops Challenge hackathon.

## How it works
- **Bun + Hono** API service handles uploads and questions.
- **Postgres** stores document metadata.
- **Elasticsearch** indexes chunked document text and powers BM25 retrieval
  for relevant passages.
- **Object storage** keeps the original uploaded files.
- **Groq (Llama 3.3 70B)** generates the final answer, grounded only in the
  retrieved chunks, with citations back to source documents.

Everything runs on Zerops, communicating over its private network
(`db:5432`, `elastic:9200`) with services wired together via `zerops.yaml`.

## Local setup
1. `bun install`
2. Create a `.env` file with:

3. `bun run dev`

Note: `DATABASE_URL` and `ES_URL` point at Zerops's private network
hostnames, so local runs of upload/ask won't fully work until deployed —
that's expected.

## Deploying on Zerops
1. Create a Zerops project.
2. Provision three services: `db` (Postgres 16), `elastic` (Elasticsearch),
   `storage` (object storage). See `zerops-project-import.yml` for the
   reference config.
3. Add an `api` service pointed at this repo — Zerops reads `zerops.yaml`
   and deploys automatically.
4. Set `GROQ_API_KEY` as an environment variable on the `api` service.
   (`DATABASE_URL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` are
   auto-injected by Zerops if your services are named as above.)

## API
- `POST /api/documents` — multipart upload, form field `file`
- `GET /api/documents` — list indexed documents
- `POST /api/ask` — JSON body `{ "question": "..." }`, returns an answer
  with cited sources
