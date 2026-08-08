# DocQuery — Zerops Challenge submission

Upload a document, ask questions about it, get answers grounded in the
actual text with citations. Built on Zerops: **Postgres** (doc metadata),
**Elasticsearch** (BM25 chunk retrieval), **object storage** (raw files),
one **Bun/Hono** API service, and **Claude** for answer generation.

## Why this architecture
- Elasticsearch does real retrieval work (not decoration) — BM25 search
  over chunked document text, no external embeddings API needed.
- Postgres tracks document metadata so the UI can list what's indexed.
- Object storage keeps the original files, separate from the search index.
- Everything talks over Zerops's private network (`db:5432`, `elastic:9200`),
  so there's a genuine multi-service architecture to explain to judges.

## Local setup
1. `bun install`
2. Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY` at minimum.
   For local dev without Zerops-provisioned db/elastic/storage, point
   `DATABASE_URL` / `ES_URL` at local instances or run them in Docker.
3. `bun run dev`

## Deploying on Zerops
1. Create a Zerops project (or let your ZCP agent do it).
2. Provision `db` (Postgres 16), `elastic` (Elasticsearch), and `storage`
   (object storage) — see `zerops-project-import.yml` for reference, or
   just prompt your agent with the one-liner in that file.
3. Push this repo / let `zerops.yaml` deploy the `api` service.
4. Set `ANTHROPIC_API_KEY` and the storage credentials as project env vars
   (Zerops auto-injects `${db_connectionString}`,
   `${storage_accessKeyId}`, `${storage_secretAccessKey}` if you name the
   services `db` and `storage` — adjust `zerops.yaml` if you name them
   differently).

## 48-hour build plan (scope: solo, finish > impress)

**Sat morning (0–4h) — scaffold + deploy skeleton**
- Provision Zerops services (db, elastic, storage, api).
- Deploy this scaffold as-is, confirm the live URL works end to end with
  a test .txt upload and a test question. Getting "deployed and working,
  even trivially" done early is the single highest-leverage step — it
  de-risks the whole rest of the weekend.

**Sat midday (4–8h) — real upload + chunking**
- Wire up PDF upload properly, verify chunking quality on a real doc.
- Confirm indexing + BM25 search returns sensible chunks for a few
  test questions.

**Sat afternoon (8–14h) — answer quality**
- Tune the Claude prompt (context size, citation format, refusal behavior
  when the doc doesn't have the answer).
- Add basic error handling (empty file, huge file, no docs indexed yet).

**Sat evening (14–18h) — UI polish**
- Clean up the frontend: loading states, multiple doc support, showing
  which chunks were cited.
- Start drafting the build post — write it while the work is fresh, don't
  leave it for Sunday night.

**Sat night → Sun morning (18–28h) — buffer + stretch goals**
- Buffer for whatever broke. If ahead of schedule, stretch goals: multi-doc
  cross-referencing, delete/re-index a doc, simple auth token.
- Do NOT start a new major feature this late unless the core is rock-solid.

**Sun (28–40h) — record demo, finalize post**
- Record the 60–90s demo video: upload → ask → grounded answer with
  citation, show the Zerops project dashboard for 5 seconds to prove
  real infrastructure.
- Publish the build post (tag @WeMakeDevs and @zeropsio), covering: what
  it does, how Zerops is used, AI tools disclosed.

**Sun (40–48h) — submit + verify**
- Fill out the submission form: repo link, live URL, video, post link.
- Double check the deployment is still up and will stay up through judging.
- Confirm you can explain every architectural decision out loud — judges
  will ask.

## AI-use disclosure (for your submission)
List whichever you actually use: this scaffold was drafted with Claude;
if you build further with Claude Code / ZCP, disclose that too, per the
hackathon's AI-use policy.
