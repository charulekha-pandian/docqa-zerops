import { Client } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";

export const es = new Client({
  Connection: HttpConnection,
  node: process.env.ES_URL || "http://elastic:9200",
  auth:
    process.env.ES_USER && process.env.ES_PASSWORD
      ? {
          username: process.env.ES_USER,
          password: process.env.ES_PASSWORD,
        }
      : undefined,
});

export const CHUNKS_INDEX = "chunks";

export async function initIndex() {
  const exists = await es.indices.exists({ index: CHUNKS_INDEX });
  if (!exists) {
    await es.indices.create({
      index: CHUNKS_INDEX,
      mappings: {
        properties: {
          documentId: { type: "keyword" },
          sessionId: { type: "keyword" },
          filename: { type: "keyword" },
          text: { type: "text" },
          chunkIndex: { type: "integer" },
        },
      },
    });
  }
}

export async function indexChunks(
  documentId: string,
  sessionId: string,
  filename: string,
  chunks: string[]
) {
  const operations = chunks.flatMap((text, i) => [
    { index: { _index: CHUNKS_INDEX } },
    { documentId, sessionId, filename, text, chunkIndex: i },
  ]);
  if (operations.length) await es.bulk({ operations, refresh: true });
}

// Search is scoped to a session — chats never see each other's documents.
export async function searchChunks(query: string, sessionId: string, size = 8) {
  const result = await es.search({
    index: CHUNKS_INDEX,
    query: {
      bool: {
        must: [{ match: { text: { query } } }],
        filter: [{ term: { sessionId } }],
      },
    },
    size,
  });
  return result.hits.hits.map((h: any) => ({
    text: h._source.text as string,
    filename: h._source.filename as string,
    score: h._score,
  }));
}

export async function deleteSessionChunks(sessionId: string) {
  await es.deleteByQuery({
    index: CHUNKS_INDEX,
    query: { term: { sessionId } },
    refresh: true,
  });
}
