/*
Here we manage the list of supported compute images and their versions.

- The default location of this file is
   https://raw.githubusercontent.com/sagemathinc/cocalc-compute-docker/main/images.json

- Admins can customize the location of this data via a configurable admin setting, in case
  they want complete control over what images are offered.

- Admins can set the role of their server to either 'test' or 'prod'. If the role is
  'test' then all images with at least one version could be shown to users.  If the
  role is 'prod', then only images with at least one role='prod' image are shown
  to users.

- A post-processed recent version of images.json is stored in the database, along
  with a timestamp of when it was stored.

- There is an API endpoint to get images.json.  If images.json was loaded recently enough,
  then the version in the database is returned.  If it was loaded too long ago, we attempt to
  get the latest version, store it in the database, and return it.  If attempting to get
  a new version fails, we return an older stale version -- github can go down for a while.

- There is also an API call that only admins can make that updates images.json immediately.
  Admins can use this if they want to force swiching to the newest version, rather than
  waiting an hour or so for the currently loaded version to expire.

- Before storing in the database, images.json gets post processed as follows:
   - (not done yet) additional information about which prebuilt images exist
     in each cloud that we support.
   - if server role is 'prod', then we strip out any image versions that don't
     have role='prod'.
   - strip all images that don't have any versions.
*/

import { getPool } from "@cocalc/database";
import getLogger from "@cocalc/backend/logger";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
// IMPORTANT: This code is only meant to be used by the nextjs app.  Note that
// nextjs polyfills fetch in: https://nextjs.org/blog/next-9-4#improved-built-in-fetch-support
declare var fetch;

const logger = getLogger("server:compute:images");

export type Role = "test" | "prod";

export interface Version {
  // tag - must be given and distinct for each version -- this typically identifies the image to docker
  tag: string;
  // version -- defaults to tag if not given; usually the upstream version
  version?: string;
  // label -- defaults to the tag; this is to display to the user
  label?: string;
  // role -- defaults to "prod"; set to "test" when this version is being tested or developed
  // and isn't ready for general use.  When it is ready to be available in production,
  // set to 'prod' (or don't set it).
  role?: Role;
}

// TODO: maybe should optionally add minDiskSizeGb to Version?

export interface Image {
  // What we show the user to describe this image, e.g., in the image select menu.
  label: string;
  // The name of the package on npmjs or dockerhub:
  package: string;
  // In case there is a different package name for ARM64, the name of it.
  package_arm64?: string;
  // Root filesystem image must be at least this big in GB.
  minDiskSizeGb?: number;
  // Description in MARKDOWN to show user of this image.  Can include links.
  description?: string;
  // Upstream URL for this image, e.g., https://julialang.org/ for the Julia image.
  url: string;
  // Icon to show next to the label for this image.
  icon: string;
  // Link to a URL with the source for building this image.
  source: string;
  // The versions of this image that we claim to have built.
  // The ones with role='prod' (or not specified) are shown
  // to users as options.
  versions: Version[];
  // authToken: if true, image has web interface that supports configurable auth token
  authToken?: boolean;
  // jupyterKernels: if false, no jupyter kernels included. If true or a list of
  // names, there are kernels available – used in frontend/jupyter/select-kernel.tsx
  jupyterKernels?: false | true | string[];
  // system: if true, this is a system container that is not for user compute
  system?: boolean;
  // disabled: if true, this image is completely disabled, so will not be used in any way.
  disabled?: boolean;
}

export type Images = { [name: string]: Image };

// name in the server_settings table
const NAME = "compute-server-images";

// 1 hour default ttl
const TTL_MS = 1000 * 60 * 60;

// Used by everything else in cocalc to get access to the images.
export async function getImages(ttlMs = TTL_MS): Promise<Images> {
  logger.debug("getImages");
  const db = getPool();
  const { rows } = await db.query(
    "SELECT value FROM server_settings WHERE name=$1",
    [NAME],
  );
  if (rows.length == 0) {
    logger.debug(
      "images aren't in database at all, so we have to get them from remote",
    );
    return await fetchImagesFromRemote(true);
  }
  let epochMs, IMAGES;
  try {
    ({ epochMs, IMAGES } = JSON.parse(rows[0].value));
  } catch (err) {
    logger.debug("invalid data in database, so just try from scratch", err);
    return await fetchImagesFromRemote();
  }
  if (Math.abs(Date.now() - epochMs) < ttlMs) {
    // abs so if clock is wrong when inserting, do limited damage
    logger.debug("return not expired IMAGES from database");
    return IMAGES;
  }

  logger.debug("IMAGES expired, so updating from remote, if possible");
  try {
    return await fetchImagesFromRemote();
  } catch (err) {
    logger.debug(
      "ERROR: not able to fetch image, but we have a cached old one, so we return that",
      err,
    );
    // return what we have
    return IMAGES;
  }
}

// Update the images object that is stored in the database,
// and also return it.
async function fetchImagesFromRemote(insert: boolean = false): Promise<Images> {
  const db = getPool();
  const url = await getRemoteUrl(db);
  const response = await fetch(url);
  const IMAGES = await response.json();
  const value = JSON.stringify({ epochMs: Date.now(), IMAGES });
  const params = [NAME, value];
  if (insert) {
    await db.query(
      "INSERT INTO server_settings(name,value) VALUES($1,$2)",
      params,
    );
  } else {
    await db.query("UPDATE server_settings SET value=$2 WHERE name=$1", params);
  }
  logger.debug("successfully updated images from remote");
  return IMAGES;
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
