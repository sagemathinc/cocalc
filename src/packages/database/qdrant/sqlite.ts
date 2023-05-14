/*
I wrote this for exporting data from a collection to sqlite3.
It might be useful, but it's a lot slower and bigger than
exporting to json-lines, so we're probably not going to use
it, except possibly for interactively exploring data (?).

E.g., you can look at or query the text field of the payload:

SELECT json_extract(payload, '$.text') as text FROM cocalc;

NOTE: If you just want to make a backup, use jsonl -- it's much faster.
The size between json and sqlite3 is the same.
*/

import Database from "better-sqlite3";
import { QdrantClient } from "@qdrant/js-client-rest";

const log = console.log;
const DEFAULT_BATCH_SIZE = 1000;

function getClient({ url, apiKey }) {
  return new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : undefined),
  });
}

export async function save({
  file,
  collection,
  batchSize = DEFAULT_BATCH_SIZE,
  url,
  apiKey,
}: {
  file?: string;
  collection: string;
  batchSize?: number;
  url: string;
  apiKey?: string;
}) {
  const t = Date.now();
  if (file == null) {
    file = `${collection}.db`;
  }
  const client = getClient({ url, apiKey });

  const info = await client.getCollection(collection);
  const { vectors_count } = info;
  log(
    "dump: there are ",
    vectors_count,
    "vectors to dump in ",
    collection
  );

  // Create sqlite database
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  // Delete the table collection if it exists
  db.exec(`DROP TABLE IF EXISTS ${collection}`);
  // Create a table in the sqlite database called collection
  // The table should have the following columns:
  //   - id: a string
  //   - payload: an arbitrary json object
  //   - vector: an array of 1536 double precision floats.:
  // In sqlite3 the types are very simple though!
  db.exec(`CREATE TABLE ${collection} (
      id TEXT,
      payload TEXT,
      vector BLOB
    )`);

  // Fetch all points in the collection in blocks, inserting them
  // into our database.
  for (let offset = 0; offset < vectors_count; offset += batchSize) {
    log("sqlite: from ", offset, " to ", offset + batchSize);
    const { points } = await client.scroll(collection, {
      limit: batchSize,
      with_payload: true,
      with_vector: true,
      offset,
    });
    if (points == null) continue;
    // insert points into the sqlite3 table collection efficiently:
    const insertStmt = db.prepare(
      `INSERT INTO ${collection} (id, payload, vector) VALUES (?, ?, ?)`
    );

    db.transaction(() => {
      for (const point of points) {
        const { id, payload, vector } = point;
        const payloadJson = JSON.stringify(payload);
        const vectorBuffer = JSON.stringify(vector);
        insertStmt.run(id, payloadJson, vectorBuffer);
      }
    })();
  }
  log("Total time:", (Date.now() - t) / 1000, " seconds");
}
