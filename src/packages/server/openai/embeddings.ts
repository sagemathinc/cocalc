/*
Determine embeddings of an array of input strings.

- For each string we compute the sha1 hash of it
- For each string where the sha1 hash was already computed, we grab the vector from Qdrant.
    - We're not worrying about hash collisions, given how unlikely they are and that our
      application is to fuzzy AI search and context inclusion, so if there is a one in
      a billion hash collision, the impact is minimal.
- For all strings where the sha1 hash was NOT known, we send them to openai and get
  their embedding vectors.
    - We truncate each input string at 8192 tokens, since otherwise we'll get an error
      from chatgpt. Do this by splitting at 81920 say characters, then tokenizing, then slicing,
      and sending the tokens to chatgpt (so they don't have to do tokenize again).
      Clients shouldn't send text that is too long, but we just handle it.
    - We then store the resulting vectors in Qdrant.
    - We store the fact we know the vectors in the openai_embedding_log table in postgres.

Note: we never want to give vectors back to clients. They get computed when not known and
immediately stored in Qdrant.  When we later do searches or similarity, we refer to the
vector for the search by id (as explained here: https://qdrant.tech/documentation/search/#search-api)

I'm not 100% sure if the input text should be stored in postgres or just the sha1's.
The advantage of storing the text is we could recompute all embeddings if we needed
to, e.g., to use a different model or due to data loss.  The disadvantage is it would
waste a lot of space. Also, we very likely do want to the text to be in Qdrant, so
we can filter on it too (e.g., to add in keyword search if we want?).  I'm not sure.
*/

import { sha1, uuidsha1 } from "@cocalc/backend/sha1";
import jsonStable from "json-stable-stringify";
import getClient from "./client";
import getPool from "@cocalc/database/pool";
import * as qdrant from "@cocalc/database/qdrant";
import { v4 } from "uuid";

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

  const input_sha1s: string[];
  const sha1_to_input: { [sha1: string]: string } = {};
  for ({ field, payload } of data) {
    const val = payload[field];
    if (!val) {
      throw Error("payload[field] must be nontrivial");
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
  const point_ids: { [sha1: string]: string } = {};
  const known = new Set<string>([]);
  for (const { input_sha1, point_id } of rows) {
    known.add(input_sha1);
    point_ids[input_sha1] = point_id;
  }

  const embeddings: { [sha1: string]: number[] } = [];
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
        newPoints.push({ input_sha1: input_sha1s[i], id: points[i].id });
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
    const resp = await qdrant.getPoints({
      ids: rows.map(({ point_id }) => point_id),
      with_payload: false,
      with_vector: true,
    });
    for (const { id, vector } of resp.result) {
      points[id_to_index[id]].vector = vector;
    }
  }

  return await savePointsInQdrant(data, input_sha1s, embeddings);
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
}): Promise<Result[]> {}

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
    .map(({ input_sha1, id }) => `('${input_sha1}', ARRAY['${id}'], NOW())`)
    .join(", ");

  // Insert data into the openai_embedding_log table using a single query
  const query = `
      INSERT INTO openai_embedding_log (input_sha1, points, time)
      VALUES ${values};
    `;

  await client.query(query);
}
