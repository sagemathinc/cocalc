// NOTE/TODO: there is a grpc client that is faster, but it is "work in progress",
// so we're waiting and will switch later.
import { QdrantClient } from "@qdrant/js-client-rest";
import { getServerSettings } from "@cocalc/server/settings/server-settings";

const COLLECTION_NAME = "cocalc";
const SIZE = 1536; // that's for the openai embeddings api

let _client: null | QdrantClient = null;
export async function getClient(): Promise<QdrantClient> {
  if (_client != null) {
    return _client;
  }
  const { qdrant_cluster_url: url, qdrant_api_key: apiKey } =
    await getServerSettings();
  if (!url) {
    throw Error("Qdrant Cluster URL not configured");
  }
  // don't necessarily require apiKey to be nontrivial, e.g., not needed locally for dev purposes.
  // We polyfill fetch so cocalc still works with node 16.  With node 18 this isn't needed.
  if (global.Headers == null) {
    const { default: fetch, Headers } = await import("node-fetch");
    global.Headers = Headers;
    global.fetch = fetch;
  }
  const client = new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : undefined),
  });
  await init(client);
  _client = client;
  return client;
}

async function init(client) {
  const { collections } = await client.getCollections();
  const collectionNames = collections.map((collection) => collection.name);
  if (collectionNames.includes(COLLECTION_NAME)) {
    // schema already configured
    // TODO: maybe we update the schema if it evolves?
    return;
  }
  // define our schema.
  await client.createCollection(COLLECTION_NAME, {
    vectors: {
      size: SIZE,
      distance: "Cosine", // pretty standard to use cosine
    },
    // Use quantization to massively reduce memory and space requirements, as explained here:
    // see https://qdrant.tech/documentation/quantization/#setting-up-scalar-quantization
    quantization_config: {
      scalar: {
        type: "int8",
        quantile: 0.99,
        always_ram: true,
      },
    },
  });

  // todo: indexes would go here, etc.,  BUT we should use db-schema and make this
  // all nicely declarative, since that's worked very well for us with postgres, etc.
}

export type Payload =
  | { [key: string]: unknown }
  | Record<string, unknown>
  | null
  | undefined;

export interface Point {
  id: string | number;
  vector: number[];
  payload?: Payload;
}

export async function upsert(data: Point[]) {
  const client = await getClient();
  await client.upsert(COLLECTION_NAME, {
    wait: true,
    points: data,
  });
}

export async function search({
  id,
  vector,
  limit,
  filter,
}: {
  vector?: number[];
  id?: string | number;
  limit: number;
  filter?: object;
}) {
  const client = await getClient();
  if (id) {
    return await client.recommend(COLLECTION_NAME, {
      positive: [id],
      limit,
      filter,
    });
  } else if (vector) {
    return await client.search(COLLECTION_NAME, {
      vector,
      limit,
      filter,
    });
  } else {
    throw Error("id or vector must be specified");
  }
}

// See https://github.com/qdrant/qdrant-js/tree/master/packages/js-client-rest/src/api for how all this works.

export async function getPoints(opts): Promise<any> {
  const client = await getClient();
  const result = await client
    .api("points")
    .getPoints({ collection_name: COLLECTION_NAME, ...opts });
  return result.data.result;
}

export async function deletePoints(opts): Promise<any> {
  const client = await getClient();
  const result = await client
    .api("points")
    .deletePoints({ collection_name: COLLECTION_NAME, ...opts });
  return result.data.result;
}
