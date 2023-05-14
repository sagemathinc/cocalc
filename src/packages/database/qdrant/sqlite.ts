/*
I wrote this for exporting data from a collection to sqlite3.
It might be useful, but it's a lot slower and bigger than
exporting to json-lines, so we're probably not going to use
it, except possibly for interactively exploring data (?).
*/

import { getClient, COLLECTION_NAME } from "./index";
import Database from "better-sqlite3";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("database:qdrant:snapshot-sqlite");

export async function dumpToSqlite({
  file = "dump.db",
  collection = COLLECTION_NAME,
  batchSize = 500,
}: {
  file?: string;
  collection?: string;
  batchSize?: number;
} = {}) {
  const client = await getClient();
  const info = await client.getCollection(collection);
  const { vectors_count } = info;
  log.debug(
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
    log.debug("dumpToSqlite: from ", offset, " to ", offset + batchSize);
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
}
