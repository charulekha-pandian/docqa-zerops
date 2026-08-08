import { Client } from "@elastic/elasticsearch";

export const es = new Client({ node: process.env.ES_URL || "http://elastic:9200" });

export const CHUNKS_INDEX = "chunks";

export async function initIndex() {
  const exists = await es.indices.exists({ index: CHUNKS_INDEX });
  if (!exists) {
    await es.indices.create({
      index: CHUNKS_INDEX,
      mappings: {
        properties: {
          documentId: { type: "keyword" },
          filename: { type: "keyword" },
          text: { type: "text" },
          chunkIndex: { type: "integer" },
        },
      },
    });
  }
}

export async function indexChunks(documentId: string, filename: string, chunks: string[]) {
  const operations = chunks.flatMap((text, i) => [
    { index: { _index: CHUNKS_INDEX } },
    { documentId, filename, text, chunkIndex: i },
  ]);
  if (operations.length) await es.bulk({ operations, refresh: true });
}

export async function searchChunks(query: string, size = 5) {
  const result = await es.search({
    index: CHUNKS_INDEX,
    query: { match: { text: { query } } },
    size,
  });
  return result.hits.hits.map((h: any) => ({
    text: h._source.text as string,
    filename: h._source.filename as string,
    score: h._score,
  }));
}
