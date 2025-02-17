/*
Service for expressing interest in directory listings in a project or compute server.
*/

import { createServiceClient, createServiceHandler } from "./typed";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
import { nanos } from "@cocalc/nats/util";

export const MAX_FILES_PER_DIRECTORY = 300;

// discard any listing after this long without update
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

// save at most this many directories
const MAX_DIRECTORIES = 50;

interface ListingsApi {
  // cause the directory listing key:value store to watch path
  interest: (path: string) => Promise<void>;

  // just directly get the listing info now for this path
  getListing: (opts: {
    path: string;
    hidden?: boolean;
  }) => Promise<DirectoryListingEntry[]>;
}

interface ListingsOptions {
  project_id: string;
  compute_server_id?: number;
}

export function createListingsClient({
  project_id,
  compute_server_id = 0,
}: ListingsOptions) {
  return createServiceClient<ListingsApi>({
    project_id,
    compute_server_id,
    service: "listings",
  });
}

export type ListingsServiceApi = ReturnType<typeof createListingsClient>;

export async function createListingsService({
  project_id,
  compute_server_id = 0,
  impl,
}: ListingsOptions & { impl }) {
  const c = compute_server_id ? ` (compute server: ${compute_server_id})` : "";
  return await createServiceHandler<ListingsApi>({
    project_id,
    compute_server_id,
    service: "listings",
    description: `Directory listing service: ${c}`,
    impl,
  });
}

export async function getListingsKV(
  opts: ListingsOptions,
): Promise<DKV<DirectoryListingEntry[]>> {
  return await dkv<DirectoryListingEntry[]>({
    name: "listings",
    limits: {
      max_msgs: MAX_DIRECTORIES,
      max_age: nanos(MAX_AGE_MS),
    },
    ...opts,
  });
}

export async function getListingsTimesKV(
  opts: ListingsOptions,
): Promise<DKV<{ updated?: number; interest: number }>> {
  return await dkv<{ updated?: number; interest: number }>({
    name: "listings-times",
    ...opts,
  });
}
