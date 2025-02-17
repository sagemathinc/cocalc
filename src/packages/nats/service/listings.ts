/*
Service for watching directory listings in a project or compute server.
*/

import { createServiceClient, createServiceHandler } from "./typed";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
import { EventEmitter } from "events";

// record info about at most this many files in a given directory
export const MAX_FILES_PER_DIRECTORY = 10;
//export const MAX_FILES_PER_DIRECTORY = 300;

// cache listing info about at most this many directories
export const MAX_DIRECTORIES = 3;
// export const MAX_DIRECTORIES = 50;

// watch directorie with interest that is this recent
export const INTEREST_CUTOFF_MS = 1000 * 30;

//export const INTEREST_CUTOFF_MS = 1000 * 60 * 10;

export interface ListingsApi {
  // cause the directory listing key:value store to watch path
  watch: (path: string) => Promise<void>;

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
  // time user requested to watch a given directory
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

/* Unified interface to the above components for clients */

export class ListingsClient extends EventEmitter {
  options: { project_id: string; compute_server_id: number };
  api: ListingsApi;
  times: DKV<Times>;
  listings: DKV<Listing>;

  constructor({
    project_id,
    compute_server_id = 0,
  }: {
    project_id: string;
    compute_server_id?: number;
  }) {
    super();
    this.options = { project_id, compute_server_id };
  }

  init = async () => {
    this.api = createListingsClient(this.options);
    this.times = await getListingsTimesKV(this.options);
    this.listings = await getListingsKV(this.options);
    this.listings.on("change", (path) => this.emit("change", path));
  };

  get = (path: string): Listing | undefined => {
    return this.listings.get(path);
  };

  getAll = () => this.listings.getAll();

  close = () => {
    this.times.close();
    this.listings.close();
  };

  watch = async (path) => {
    await this.api.watch(path);
  };

  getListing = async (opts) => {
    return await this.api.getListing(opts);
  };
}

export async function listingsClient(options) {
  const C = new ListingsClient(options);
  await C.init();
  return C;
}
