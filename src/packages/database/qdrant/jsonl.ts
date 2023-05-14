/*
Save and restore the *data* in a collection to/from a jsonl  file.
That's json-lines, i.e., https://www.atatus.com/glossary/jsonl/

I wrote this because it's faster and "easier to trust" than Qdrant's built in
snapshot functionality for my use case.  It actually seems like this is 10x faster,
probably because it discards all the indexing and other internal metadata.
That's OK for our longterm backups though.

Use json lines directly is also nice since we can make incremental deduped backups
using bup, and also just visibly inspect the data to see it is there.
It's also useful for dumping a collection, changing params, and reading the collection
back in.
*/

import { getClient, COLLECTION_NAME } from "./index";
import { getLogger } from "@cocalc/backend/logger";
import * as fs from "fs";
import * as readline from "readline";

const log = getLogger("database:qdrant:snapshot-json");

export async function save({
  collection = COLLECTION_NAME,
  batchSize = 500,
  file,
}: {
  file?: string;
  collection?: string;
  batchSize?: number;
} = {}) {
  const t = Date.now();
  if (file == null) {
    file = `${collection}.jsonl`;
  }
  const client = await getClient();
  const info = await client.getCollection(collection);
  const { vectors_count } = info;
  log.debug(
    "save: there are",
    vectors_count,
    "vectors to save in",
    collection,
    "to",
    file
  );

  // Create a write stream for the output file
  const compressedStream = fs.createWriteStream(file);

  // Fetch all points in the collection in blocks, compressing and
  // writing them to the output file
  for (let offset = 0; offset < vectors_count; offset += batchSize) {
    log.debug("save: from ", offset, " to ", offset + batchSize);
    const { points } = await client.scroll(collection, {
      limit: batchSize,
      with_payload: true,
      with_vector: true,
      offset,
    });
    if (points == null) continue;
    for (const point of points) {
      const compressedLine = JSON.stringify(point) + "\n";
      compressedStream.write(compressedLine);
    }
  }

  // Close the write stream when done
  compressedStream.end();
  log.debug("Total time:", (Date.now() - t) / 1000, " seconds");
}

// Reads the data into the collection from the json file.
// This does not configure the collection in any way or
// delete anything from the collection.
export async function load({
  collection = COLLECTION_NAME,
  batchSize = 500,
  file,
}: {
  file?: string;
  collection?: string;
  batchSize?: number;
} = {}) {
  const t = Date.now();
  if (file == null) {
    file = `${collection}.jsonl`;
  }
  const client = await getClient();

  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let points: any[] = []; // use any[] for convenience, replace with real type
  let numParsed = 0;

  const upsertPoints = async () => {
    rl.pause();
    await client.upsert(collection, {
      wait: true,
      points,
    });
    numParsed += points.length;
    log.debug("load: upserted ", numParsed);
    points.length = 0; // reset the batch
    rl.resume();
  };

  rl.on("line", async (line) => {
    // Process the line here
    const point = JSON.parse(line);
    points.push(point);

    if (points.length >= batchSize) {
      // If we've reached a full batch size, process it
      // [insert code to write batch to qdrant database here]
      log.debug("load: loaded ", numParsed);
      await upsertPoints();
    }
  });

  rl.on("close", async () => {
    // If there are any remaining points in the batch, process them
    if (points.length > 0) {
      await upsertPoints();
    }

    log.debug("loadFromJson: finished processing ", numParsed);
    log.debug("Total time:", (Date.now() - t) / 1000, " seconds");
  });
}
