/*
Here we manage the list of supported compute images and their versions.

- The default location of this file is
   https://raw.githubusercontent.com/sagemathinc/cocalc-compute-docker/main/images.json

- Admins can customize the location of this data via a configurable admin setting, in case
  they want complete control over what images are offered.

- A post-processed recent version of images.json is stored in the database, along
  with a timestamp (ms since epoch) of when it was stored.

- There is an API endpoint to get images.json.  If images.json was loaded recently enough,
  then the version in the database is returned.  If it was loaded too long ago, we attempt to
  get the latest version, store it in the database, and return it.  If attempting to get
  a new version fails, we return an older stale version -- github can go down for a while.

- There is also an API call that only admins can make that updates images.json immediately.
  Admins can use this if they want to force switching to the newest version, rather than
  waiting an hour or so for the currently loaded version to expire.

- Before storing in the database, images.json gets post processed as follows:
   - (not done yet) additional information about which prebuilt images exist
     in each cloud that we support.
*/

import { createDatabaseCachedResource } from "@cocalc/server/compute/database-cache";
import { getPool } from "@cocalc/database";
import getLogger from "@cocalc/backend/logger";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import type { Images } from "@cocalc/util/db-schema/compute-servers";
export type { Images };
// IMPORTANT: This code is only meant to be used by the nextjs app.  Note that
// nextjs polyfills fetch in: https://nextjs.org/blog/next-9-4#improved-built-in-fetch-support
declare var fetch;

const logger = getLogger("server:compute:images");

// name in the server_settings table
export const COMPUTE_SERVER_IMAGES = "compute-server-images";

// 1 hour default ttl
const TTL_MS = 1000 * 60 * 60;

// Used by everything else in cocalc to get access to the images.
export const { get: getImages } = createDatabaseCachedResource<Images>({
  ttl: TTL_MS,
  cloud: "all",
  key: COMPUTE_SERVER_IMAGES,
  fetchData: fetchImagesFromRemote,
});

// Update the images object that is stored in the database,
// and also return it.
async function fetchImagesFromRemote(): Promise<Images> {
  const db = getPool();
  const url = `${await getRemoteUrl(db)}?random=${Math.random()}`;
  logger.debug("fetchImagesFromRemote", { url });
  const response = await fetch(url);
  return await response.json();
}

async function getRemoteUrl(db): Promise<string> {
  const { rows } = await db.query(
    "SELECT value FROM server_settings WHERE name='compute_servers_images_spec_url'",
  );
  if (rows.length > 0 && rows[0].value) {
    return rows[0].value;
  }
  return EXTRAS.compute_servers_images_spec_url.default;
}
