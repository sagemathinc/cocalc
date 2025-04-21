/*
Service for watching directory listings in a project or compute server.
*/

import { createServiceClient, createServiceHandler } from "./typed";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
import { EventEmitter } from "events";
import refCache from "@cocalc/util/refcache";

// record info about at most this many files in a given directory
//export const MAX_FILES_PER_DIRECTORY = 10;
export const MAX_FILES_PER_DIRECTORY = 500;

// cache listing info about at most this many directories
//export const MAX_DIRECTORIES = 3;
export const MAX_DIRECTORIES = 50;

// watch directories with interest that are this recent
//export const INTEREST_CUTOFF_MS = 1000 * 30;
export const INTEREST_CUTOFF_MS = 1000 * 60 * 10;

export const MIN_INTEREST_INTERVAL_MS = 15 * 1000;

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

export function createListingsApiClient({
  project_id,
  compute_server_id = 0,
}: ListingsOptions) {
  return createServiceClient<ListingsApi>({
    project_id,
    compute_server_id,
    service: "listings",
  });
}

export type ListingsServiceApi = ReturnType<typeof createListingsApiClient>;

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
  deleted?: string[];
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
  api: Awaited<ReturnType<typeof createListingsApiClient>>;
  times?: DKV<Times>;
  listings?: DKV<Listing>;

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
    try {
      this.api = createListingsApiClient(this.options);
      this.times = await getListingsTimesKV(this.options);
      this.listings = await getListingsKV(this.options);
      this.listings.on("change", this.handleListingsChange);
    } catch (err) {
      this.close();
      throw err;
    }
  };

  handleListingsChange = ({ key: path }) => {
    this.emit("change", path);
  };

  get = (path: string): Listing | undefined => {
    if (this.listings == null) {
      throw Error("not ready");
    }
    return this.listings.get(path);
  };

  getAll = () => {
    if (this.listings == null) {
      throw Error("not ready");
    }
    return this.listings.getAll();
  };

  close = () => {
    this.removeAllListeners();
    this.times?.close();
    delete this.times;
    if (this.listings != null) {
      this.listings.removeListener("change", this.handleListingsChange);
      this.listings.close();
      delete this.listings;
    }
  };

  watch = async (path, force = false) => {
    if (this.times == null) {
      throw Error("not ready");
    }
    if (!force) {
      const last = this.times.get(path)?.interest ?? 0;
      if (Math.abs(Date.now() - last) < MIN_INTEREST_INTERVAL_MS) {
        // somebody already expressed interest very recently
        return;
      }
    }
    await this.api.watch(path);
  };

  getListing = async (opts) => {
    return await this.api.getListing(opts);
  };
}

export const listingsClient = refCache<
  ListingsOptions & { noCache?: boolean },
  ListingsClient
>({
  name: "listings",
  createObject: async (options: ListingsOptions) => {
    const C = new ListingsClient(options);
    await C.init();
    return C;
  },
});
