import { getCredentials } from "./client";
import { ImagesClient } from "@google-cloud/compute";
import TTLCache from "@isaacs/ttlcache";
import dayjs from "dayjs";

export type ImageType = "cuda" | "standard" | "sagemath";
export type Architecture = "x86_64" | "arm64";

// Return the latest available image of the given type on the configured cluster.
// Returns null if no images of the given type are available.

export function imageName({
  type,
  date,
  tag,
  arch = "x86_64",
}: {
  type: ImageType;
  date?: Date;
  tag?: string;
  arch?: Architecture;
}) {
  const prefix = `cocalc-image-${type}-${arch == "x86_64" ? "x86" : arch}`; // _ not allowed
  if (!date) {
    return prefix;
  }

  // this format matches with what we use internally on cocalc.com for docker images in Kubernetes:
  const dateFormatted = dayjs(date).format("YYYY-MM-DD-HHmmss");
  return `${prefix}-${dateFormatted}${tag ? "-" + tag : ""}`;
}

let client: ImagesClient | undefined = undefined;
let projectId: string | undefined;
export async function getImagesClient() {
  if (client != null && projectId != null) {
    return { client, projectId };
  }
  const credentials = await getCredentials();
  client = new ImagesClient(credentials);
  projectId = credentials.projectId as string;
  return { client, projectId };
}

// filters are documented at https://cloud.google.com/sdk/gcloud/reference/topic/filters/
// and "The matching is anchored and case insensitive. An optional trailing * does a
// word prefix match."

const imageCache = new TTLCache({ ttl: 3 * 60 * 1000 });
export async function getAllImages({
  type,
  arch = "x86_64",
}: {
  type: ImageType;
  arch?: Architecture;
}): Promise<string[]> {
  if (imageCache.has(type)) {
    return imageCache.get(type)!;
  }
  const prefix = imageName({ type, arch });
  const { client, projectId } = await getImagesClient();
  const [response] = await client.list({
    project: projectId,
    maxResults: 1000,
    filter: `name:${prefix}*`,
  });
  const images = response.filter((x) => x.name != null).map((x) => x.name!);
  imageCache.set(type, images);
  return images;
}

export async function getImage({
  type,
  arch = "x86_64",
}: {
  type: ImageType;
  arch?: Architecture;
}): Promise<string | null> {
  const images = await getAllImages({ type, arch });
  images.sort();
  return images[images.length - 1];
}

// TODO: we obviously need to make it so the image that is used is something
// that can be set in the database via the admin user interface or something.
// Since we (1) create the image, then (2) want to somehow test it, before
// (3) making it the live default.  But we need a way to force a compute server
// to run on a non-default image too and also we want to be able to revert in
// case of problems.
