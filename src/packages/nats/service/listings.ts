/*
Service for expressing interest in directory listings in a project or compute server.
*/

import { createServiceClient, createServiceHandler } from "./typed";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import { dkv, type DKV } from "@cocalc/nats/sync/dkv";

// record info about at most this many files in a given directory
export const MAX_FILES_PER_DIRECTORY = 10;
//export const MAX_FILES_PER_DIRECTORY = 300;

// cache listing info about at most this many directories
export const MAX_DIRECTORIES = 3;
// export const MAX_DIRECTORIES = 50;

// watch directorie with interest that is this recent
export const INTEREST_CUTOFF_MS = 1000 * 30;

//export const INTEREST_CUTOFF_MS = 1000 * 60 * 10;

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

const limits = {
  max_msgs: MAX_DIRECTORIES,
};

export interface Listing {
  files?: DirectoryListingEntry[];
  exists?: boolean;
  error?: string;
  time: number;
  more?: boolean;
}

export async function getListingsKV(
  opts: ListingsOptions,
): Promise<DKV<Listing>> {
  return await dkv<Listing>({
    name: "listings",
    limits,
    ...opts,
  });
}

export interface Times {
  // time last files for a given directory were attempted to be updated
  updated?: number;
  // time user last expressed interest in a given directory
  interest?: number;
}

export async function getListingsTimesKV(
  opts: ListingsOptions,
): Promise<DKV<Times>> {
  return await dkv<Times>({
    name: "listings-times",
    limits,
    ...opts,
  });
}
