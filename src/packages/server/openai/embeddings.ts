import { sha1, uuidsha1 } from "@cocalc/backend/sha1";
import jsonStable from "json-stable-stringify";
import getClient from "./client";
import * as qdrant from "@cocalc/database/qdrant";
import { getClient as getDB } from "@cocalc/database/pool";

export interface Data {
  payload: qdrant.Payload;
  field: string; // payload[field] is the text we encode as a vector
}

export async function save(data: Data[]): Promise<string[]> {
  // Define the Qdrant points that we will be inserting corresponding
  // to the given data.
  const points: Partial<qdrant.Point>[] = [];
  const point_ids: string[] = [];
  for (const { payload } of data) {
    const id = uuidsha1(jsonStable(payload));
    point_ids.push(id);
    points.push({ id, payload });
  }

  // Now we need the vector component of each of these points.
  // These might be available in Qdrant already, or we
  // might have to compute them by using the embedding.

  const input_sha1s: string[] = [];
  const sha1_to_input: { [sha1: string]: string } = {};
  const sha1_to_index: { [id: string]: number } = {};
  let i = 0;
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
    sha1_to_index[s] = i;
    i += 1;
  }
  // Query database for known embedding vectors.  We don't have to do this,
  // but the idea is to never call openai again once we compute the embedding
  // for a string.
  const db = getDB();
  const alreadyStored = new Set<string>([]); // data that is already stored.
  try {
    await db.connect();
    const { rows } = await db.query(
      `
        SELECT
          input_sha1,
          points[1] AS point_id,
          ARRAY(
            SELECT unnested_points
            FROM unnest(points) AS unnested_points
            WHERE unnested_points = ANY ($2)
          ) AS intersected_points
        FROM
          openai_embedding_log
        WHERE
          input_sha1 = ANY ($1)
`,
      [input_sha1s, point_ids]
    );
    const known = new Set<string>([]);
    for (const { input_sha1, intersected_points } of rows) {
      if (intersected_points.length > 0) {
        for (const id of intersected_points) {
          alreadyStored.add(id);
          known.add(id);
        }
        continue;
      }
      known.add(input_sha1);
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
      // [ ] TODO: add info about tokens
      // [ ] TODO: ensure inputs aren't too long
      await saveEmbeddingsInPostgres(db, newPoints);
    }

    if (known.size > 0) {
      // retrieve already known vectors from qdrant
      // [ ] TODO: if for some reason there's no vector, fall back to explicit call to createEmbeddings
      //     This should never happen, but will avoid pain down the line "just in case".
      const ids = rows
        .map(({ point_id }) => point_id)
        .filter((id) => !alreadyStored.has(id));
      if (ids.length > 0) {
        const knownPoints = await qdrant.getPoints({
          ids,
          with_payload: false,
          with_vector: true,
        });
        const idToVec: { [id: string]: number[] } = {};
        for (const { id, vector } of knownPoints) {
          idToVec[id] = vector;
        }
        let i = 0;
        const additionalPoints: { input_sha1: string; id: string }[] = [];
        for (const id of ids) {
          const pnt = points[sha1_to_index[rows[i].input_sha1]];
          if (!alreadyStored.has(pnt.id as string)) {
            additionalPoints.push({
              input_sha1: rows[i].input_sha1,
              id: pnt.id as string,
            });
          }
          pnt.vector = idToVec[id];

          i += 1;
        }
        await saveAdditionalPointsInPostgres(db, additionalPoints);
      }
    }

    const pointsToStore = points.filter(
      (point) => !alreadyStored.has(point.id as string)
    );
    if (pointsToStore.length > 0) {
      await qdrant.upsert(pointsToStore as qdrant.Point[]);
    }

    return points.map(({ id }) => id) as string[];
  } finally {
    db.end();
  }
}

export interface Result {
  id: string | number;
  payload?: qdrant.Payload;
  score: number;
}

export async function search({
  input,
  filter,
  limit,
}: {
  input: string;
  filter?: object;
  limit: number;
}): Promise<Result[]> {
  const [id] = await save([{ payload: { input }, field: "input" }]);
  return await qdrant.search({ id, filter, limit });
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
  db,
  newPoints: { input_sha1: string; id: string }[]
) {
  if (newPoints.length == 0) return;
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

  await db.query(query);
}

// This is relatively rare so we just do it in a fairly dumb way
// instead of trying to do it all in one query.
async function saveAdditionalPointsInPostgres(
  db,
  additionalPoints: { input_sha1: string; id: string }[]
) {
  if (additionalPoints.length == 0) return;
  for (const { input_sha1, id } of additionalPoints) {
    await db.query(
      "UPDATE openai_embedding_log SET points=points||$1::UUID WHERE input_sha1=$2",
      [id, input_sha1]
    );
  }
}
