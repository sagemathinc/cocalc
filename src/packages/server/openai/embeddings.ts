import { sha1, uuidsha1 } from "@cocalc/backend/sha1";
import jsonStable from "json-stable-stringify";
import getClient from "./client";
import getPool from "@cocalc/database/pool";
import * as qdrant from "@cocalc/database/qdrant";

interface Data {
  payload: qdrant.Payload;
  field: string; // payload[field] is the text we encode.
}

export async function save(data: Data[]): Promise<string[]> {
  // Define the Qdrant points that we will be inserting corresponding
  // to the given data.
  const points: Partial<qdrant.Point>[] = [];
  const id_to_index: { [id: string]: number } = {};
  let i = 0;
  for (const { payload } of data) {
    const id = uuidsha1(jsonStable(payload));
    points.push({ id, payload });
    id_to_index[id] = i;
    i += 1;
  }

  // Now we need the vector component of each of these points.
  // These might be available in Qdrant already, or we
  // might have to compute them by using the embedding.

  const input_sha1s: string[] = [];
  const sha1_to_input: { [sha1: string]: string } = {};
  for (const { field, payload } of data) {
    if (payload == null) {
      throw Error("all payloads must be defined");
    }
    const val = payload[field];
    if (!val || typeof val != "string") {
      throw Error("payload[field] must be a nontrivial string");
    }
    const s = sha1(val);
    input_sha1s.push(s);
    sha1_to_input[s] = val;
  }
  // Query database for known embedding vectors.  We don't have to do this,
  // but the idea is to never call openai again once we compute the embedding
  // for a string.
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT input_sha1, points[1] AS point_id FROM openai_embedding_log WHERE input_sha1 = ANY ($1)",
    [input_sha1s]
  );
  console.log({ input_sha1s, rows });
  const point_ids: { [sha1: string]: string } = {};
  const known = new Set<string>([]);
  for (const { input_sha1, point_id } of rows) {
    known.add(input_sha1);
    point_ids[input_sha1] = point_id;
  }

  if (known.size < data.length) {
    const unknown = input_sha1s.filter((x) => !known.has(x));
    const inputs = unknown.map((x) => sha1_to_input[x]);
    const vectors = await createEmbeddings(inputs);
    // record these in our points array
    const newPoints: { input_sha1: string; id: string }[] = [];
    let j = 0;
    for (let i = 0; i < points.length; i++) {
      if (!known.has(input_sha1s[i])) {
        points[i].vector = vectors[j];
        const { id } = points[i];
        if (typeof id != "string") {
          throw Error("bug");
        }
        newPoints.push({ input_sha1: input_sha1s[i], id });
        j += 1;
      }
    }
    // store these as new records in postgresql
    // [ ] TODO: add info about size
    // [ ] TODO: ensure inputs aren't too long
    await saveEmbeddingsInPostgres(pool, newPoints);
  }

  if (known.size > 0) {
    // retrieve already known vectors from qdrant
    const knownPoints = await qdrant.getPoints({
      ids: rows.map(({ point_id }) => point_id),
      with_payload: false,
      with_vector: true,
    });
    for (const { id, vector } of knownPoints) {
      points[id_to_index[id]].vector = vector;
    }
  }

  await qdrant.upsert(points as qdrant.Point[]);

  return points.map(({ id }) => id) as string[];
}

interface Result {
  data: {
    id: number;
    payload: qdrant.Payload;
  };
  score: number;
}

export async function search({
  input,
  filter,
  limit,
}: {
  input: string;
  filter?;
  limit: number;
}): Promise<Result[]> {
  console.log("search", { input, filter, limit });
  return [];
}

async function createEmbeddings(input: string[]): Promise<number[][]> {
  const openai = await getClient();
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input,
  });
  return response.data.data.map((x) => x.embedding);
}

async function saveEmbeddingsInPostgres(
  pool,
  newPoints: { input_sha1: string; id: string }[]
) {
  // We don't have to worry about sql injection because all the inputs
  // are sha1 hashes and uuid's that we computed.
  // Construct the values string for the query
  const values = newPoints
    .map(
      ({ input_sha1, id }) => `('${input_sha1}', ARRAY['${id}'::UUID], NOW())`
    )
    .join(", ");

  // Insert data into the openai_embedding_log table using a single query
  const query = `
      INSERT INTO openai_embedding_log (input_sha1, points, time)
      VALUES ${values};
    `;

  await pool.query(query);
}
