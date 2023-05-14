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

// NOTE: this file should be usable outside of the rest of the cocalc code.
// In particular, don't move or rename this file, since that would break
// building kucalc's qdrant docker container.

import * as fs from "fs";
import * as readline from "readline";
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
  collection,
  batchSize = DEFAULT_BATCH_SIZE,
  file,
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
    file = `${collection}.jsonl`;
  }
  const client = getClient({ url, apiKey });
  const info = await client.getCollection(collection);
  const { vectors_count } = info;
  log(
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
  let offset: string | undefined = undefined;
  for (let n = 0; n < vectors_count; n += batchSize) {
    log("save: from ", n, " to ", n + batchSize);
    const { points } = await client.scroll(collection, {
      limit: batchSize + (offset ? 1 : 0),
      with_payload: true,
      with_vector: true,
      offset,
    });
    if (points == null) continue;
    if (offset && points[0]?.id == offset) {
      // delete first point since it was the offset.
      points.shift();
    }
    offset = points[points.length-1].id as string;
    for (const point of points) {
      const compressedLine = JSON.stringify(point) + "\n";
      compressedStream.write(compressedLine);
    }
  }

  // Close the write stream when done
  compressedStream.end();
  log("Total time:", (Date.now() - t) / 1000, " seconds");
}

// Reads the data into the collection from the json file.
// This does not configure the collection in any way or
// delete anything from the collection.
export async function load({
  collection,
  batchSize = DEFAULT_BATCH_SIZE,
  file,
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
    file = `${collection}.jsonl`;
  }
  const client = getClient({ url, apiKey });

  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let points: any[] = []; // use any[] for convenience, replace with real type
  let numParsed = 0;

  const upsertPoints = async () => {
    await client.upsert(collection, {
      wait: true,
      points,
    });
    numParsed += points.length;
    log("load: upserted ", points.length);
    points.length = 0; // reset the batch
  };

  for await (const line of rl) {
    const point = JSON.parse(line);
    points.push(point);
    if (points.length >= batchSize) {
      // If we've reached a full batch size, process it
      // [insert code to write batch to qdrant database here]
      log("load: read ", numParsed, " from disk");
      await upsertPoints();
    }
  }
  // If there are any remaining points in the batch, process them
  if (points.length > 0) {
    await upsertPoints();
  }

  log("loadFromJson: finished processing ", numParsed);
  log("Total time:", (Date.now() - t) / 1000, " seconds");
}
