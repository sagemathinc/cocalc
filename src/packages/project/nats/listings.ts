/* Directory Listings

- A service "listings" in each project and compute server that users call to express
  interest in a directory.  When there is recent interest in a
  directory, we watch it for changes.

- A DKV store keys paths in the filesystem and values the first
  few hundred (ordered by recent) files in that directory, all relative
  to the home directory.

*/

import getListing from "@cocalc/backend/get-listing";
import {
  createListingsService,
  getListingsKV,
  getListingsTimesKV,
  MAX_FILES_PER_DIRECTORY,
} from "@cocalc/nats/service/listings";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { init as initClient } from "@cocalc/project/client";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import { delay } from "awaiting";
import { type DKV } from "./sync";
import { type NatsService } from "@cocalc/nats/service";

let listings: Listings | null;

const impl = {
  // cause the directory listing key:value store to watch path
  interest: async (path: string) => {
    while (listings == null) {
      await delay(3000);
    }
    listings.interest(path);
  },

  getListing: async ({ path, hidden }) => {
    return await getListing(path, hidden);
  },
};

let service: NatsService | null;
export async function init() {
  initClient();

  service = await createListingsService({
    project_id,
    compute_server_id,
    impl,
  });
  const L = new Listings();
  await L.init();
  listings = L;
}

export async function close() {
  service?.close();
  listings?.close();
}

class Listings {
  private listings: DKV<DirectoryListingEntry[]>;
  private times: DKV<{
    // time last files for a given directory were last updated
    updated?: number;
    // time user last expressed interest in a given directory
    interest: number;
  }>;

  init = async () => {
    this.listings = await getListingsKV({ project_id, compute_server_id });
    this.times = await getListingsTimesKV({ project_id, compute_server_id });
  };

  close = () => {
    this.listings?.close();
    this.times?.close();
  };

  interest = async (path: string) => {
    this.times.set(path, { ...this.times.get(path), interest: Date.now() });

    console.log("ignoring ", MAX_FILES_PER_DIRECTORY);
    this.listings.set(path, await getListing(path, true));
  };
}
