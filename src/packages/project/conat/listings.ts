/* Directory Listings

- A service "listings" in each project and compute server that users call to express
  interest in a directory.  When there is recent interest in a
  directory, we watch it for changes.

- A DKV store keys paths in the filesystem and values the first
  few hundred (ordered by recent) files in that directory, all relative
  to the home directory.


DEVELOPMENT:

1. Stop listings service running in the project by running this in your browser:

   await cc.client.nats_client.projectApi(cc.current()).system.terminate({service:'listings'})

    {status: 'terminated', service: 'listings'}


2. Setup project environment variables as usual (see README.md)

3. Start your own server

.../src/packages/project/nats$ node


    await require('@cocalc/project/conat/listings').init()

*/

import getListing from "@cocalc/backend/get-listing";
import {
  createListingsService,
  getListingsKV,
  getListingsTimesKV,
  MAX_FILES_PER_DIRECTORY,
  INTEREST_CUTOFF_MS,
  type Listing,
  type Times,
} from "@cocalc/conat/service/listings";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { init as initClient } from "@cocalc/project/client";
import { delay } from "awaiting";
import { type DKV } from "./sync";
import { type ConatService } from "@cocalc/conat/service";
import { MultipathWatcher } from "@cocalc/backend/path-watcher";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project:nats:listings");

let service: ConatService | null;
export async function init() {
  logger.debug("init: initializing");
  initClient();

  service = await createListingsService({
    project_id,
    compute_server_id,
    impl,
  });
  const L = new Listings();
  await L.init();
  listings = L;
  logger.debug("init: fully ready");
}

export async function close() {
  service?.close();
  listings?.close();
}

let listings: Listings | null;

const impl = {
  // cause the directory listing key:value store to watch path
  watch: async (path: string) => {
    while (listings == null) {
      await delay(3000);
    }
    listings.watch(path);
  },

  getListing: async ({ path, hidden }) => {
    return await getListing(path, hidden);
  },
};

class Listings {
  private listings: DKV<Listing>;

  private times: DKV<Times>;

  private watcher: MultipathWatcher;

  private state: "init" | "ready" | "closed" = "init";

  constructor() {
    this.watcher = new MultipathWatcher();
    this.watcher.on("change", this.updateListing);
  }

  init = async () => {
    logger.debug("Listings.init: start");
    this.listings = await getListingsKV({ project_id, compute_server_id });
    this.times = await getListingsTimesKV({ project_id, compute_server_id });
    // start watching paths with recent interest
    const cutoff = Date.now() - INTEREST_CUTOFF_MS;
    const times = this.times.getAll();
    for (const path in times) {
      if ((times[path].interest ?? 0) >= cutoff) {
        await this.updateListing(path);
      }
    }
    this.monitorInterestLoop();
    this.state = "ready";
    logger.debug("Listings.init: done");
  };

  private monitorInterestLoop = async () => {
    while (this.state != "closed") {
      const cutoff = Date.now() - INTEREST_CUTOFF_MS;
      const times = this.times.getAll();
      for (const path in times) {
        if ((times[path].interest ?? 0) <= cutoff) {
          if (this.watcher.has(path)) {
            logger.debug("monitorInterestLoop: stop watching", { path });
            this.watcher.delete(path);
          }
        }
      }
      await delay(30 * 1000);
    }
  };

  close = () => {
    this.state = "closed";
    this.watcher.close();
    this.listings?.close();
    this.times?.close();
  };

  updateListing = async (path: string) => {
    logger.debug("updateListing", { path });
    path = canonicalPath(path);
    this.watcher.add(canonicalPath(path));
    const start = Date.now();
    try {
      let files = await getListing(path, true, {
        limit: MAX_FILES_PER_DIRECTORY + 1,
      });
      const more = files.length == MAX_FILES_PER_DIRECTORY + 1;
      if (more) {
        files = files.slice(0, MAX_FILES_PER_DIRECTORY);
      }
      this.listings.set(path, {
        files,
        exists: true,
        time: Date.now(),
        more,
      });
      logger.debug("updateListing: success", {
        path,
        ms: Date.now() - start,
        count: files.length,
        more,
      });
    } catch (err) {
      let error = `${err}`;
      if (error.startsWith("Error: ")) {
        error = error.slice("Error: ".length);
      }
      this.listings.set(path, {
        error,
        time: Date.now(),
        exists: error.includes("ENOENT") ? false : undefined,
      });
      logger.debug("updateListing: error", {
        path,
        ms: Date.now() - start,
        error,
      });
    }
  };

  watch = async (path: string) => {
    logger.debug("watch", { path });
    path = canonicalPath(path);
    this.times.set(path, { ...this.times.get(path), interest: Date.now() });
    this.updateListing(path);
  };
}

// this does a tiny amount to make paths more canonical.
function canonicalPath(path: string): string {
  if (path == "." || path == "~") {
    return "";
  }
  return path;
}
