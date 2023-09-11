import { getCredentials } from "./client";
import { ImagesClient } from "@google-cloud/compute";
import TTLCache from "@isaacs/ttlcache";

export type ImageType = "cuda" | "standard" | "sagemath";

// Return the latest available image of the given type on the configured cluster.
// Returns null if no images of the given type are available.

function imageName(type: ImageType, date?: Date) {
  return `cocalc-compute-${type}${date ? "-" + date.toISOString() : ""}`;
}

let client: ImagesClient | undefined = undefined;
let projectId: string | undefined;
async function getImageClient() {
  if (client != null && projectId != null) {
    return client;
  }
  const credentials = await getCredentials();
  client = new ImagesClient(credentials);
  projectId = credentials.projectId;
  return { client, projectId };
}

// filters are documented at https://cloud.google.com/sdk/gcloud/reference/topic/filters/
// and "The matching is anchored and case insensitive. An optional trailing * does a
// word prefix match."

const imageCache = new TTLCache({ ttl: 3 * 60 * 1000 });
export async function getAllImages(type: ImageType): Promise<string | null> {
  if (imageCache.has(type)) {
    return imageCache.get(type)!;
  }
  const prefix = imageName(type);
  const { client, projectId } = await getImageClient();
  const [response] = await client.list({
    project: projectId,
    maxResults: 1000,
    filter: `name:${prefix}*`,
  });
  const images = response.map((x) => x.name);
  imageCache.set(type, images);
  return images;
}

export async function getImage(type: ImageType): Promise<string | null> {
  const images = await getAllImages(type);
  images.sort();
  return images[images.length - 1];
}
