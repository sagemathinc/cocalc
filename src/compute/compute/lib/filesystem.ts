/*
Mount a remote CoCalc project's filesystem locally over a websocket using FUSE.

 await require('.').mount({remote:'wss://cocalc.com/10f0e544-313c-4efe-8718-2142ac97ad11/raw/.smc/websocketfs',path:process.env.HOME + '/dev2', connectOptions:{perMessageDeflate: false,  headers: {Cookie: require('cookie').serialize('api_key', 'sk-at7ALcGBKMbzq7Vc00000P')}}})


*/

import { apiKey, apiServer, apiBasePath } from "@cocalc/backend/data";
import { mount } from "websocketfs";
import getLogger from "@cocalc/backend/logger";
import { project } from "@cocalc/api-client";
import { serialize } from "cookie";
import { join } from "path";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { execa } from "execa";
import filesystemCache from "./filesystem-cache";
import { waitUntilFilesystemIsOfType } from "./util";

const logger = getLogger("compute:filesystem");

interface Options {
  // which project -- defaults to process.env.PROJECT_ID, which must be given if this isn't
  project_id?: string;
  // path to mount at -- defaults to '/home/user'
  path?: string;
  // these options are passed on to the websocketfs mount command
  options?;
  // options used for unionfs caching, which is used only if these two directories are set.
  // They should be empty directories that exists and user has write access to, and they
  //    - lower = where websocketfs is mounted
  //    - upper = local directory used for caching.
  unionfs?: {
    upper: string;
    lower: string;
    // If true, doesn't do anything until the type of the filesystem that lower is
    // mounted on is of this type, e.g., "fuse". This is done *INSTEAD OF* just
    // trying to mount that filesystem.  Why? because in docker we hit a deadlock
    // when trying to do both in the same process (?), which I can't solve -- maybe
    // a bug in node.  In any case, separating the unionfs into a separate container
    // is nice anyways.
    waitLowerFilesystemType?: string;
  };
  compute_server_id?: number;
  cacheTimeout?: number;
  syncInterval?: number;
  exclude?: string[];
  readTrackingPath?: string;
}

export async function mountProject({
  project_id = process.env.PROJECT_ID,
  path = "/home/user", // where to mount the project's HOME directory
  unionfs,
  options,
  compute_server_id = parseInt(process.env.COMPUTE_SERVER_ID ?? "0"),
  cacheTimeout,
  syncInterval,
  exclude = [],
  readTrackingPath,
}: Options = {}) {
  const log = (...args) => logger.debug(path, ...args);
  log();
  if (!compute_server_id) {
    throw Error("set the compute_server_id or process.env.COMPUTE_SERVER_ID");
  }
  if (!project_id) {
    throw Error("project_id or process.env.PROJECT_ID must be given");
  }
  if (!apiKey) {
    throw Error("api key must be set (e.g., set API_KEY env variable)");
  }

  // Ping to start the project:
  await project.ping({ project_id });

  let protocol, host;
  if (apiServer.startsWith("https://")) {
    protocol = "wss://";
    host = apiServer.slice("https://".length);
  } else if (apiServer.startsWith("http://")) {
    protocol = "ws://";
    host = apiServer.slice("http://".length);
  } else {
    throw Error("API_SERVER must start with http:// or https://");
  }
  const remote = `${protocol}${host}${join(
    apiBasePath,
    project_id,
    "raw/.smc/websocketfs",
  )}`;
  log("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  // SECURITY: DO NOT log headers and connectOptions, obviously!

  let homeMountPoint;
  if (unionfs == null) {
    homeMountPoint = path;
  } else {
    homeMountPoint = unionfs.lower;
    if (!unionfs.lower || !unionfs.upper) {
      throw Error("if unionfs is specified, both lower and upper must be set");
    }
  }

  let unmount;
  if (unionfs?.waitLowerFilesystemType) {
    // we just wait for it to get mounted in some other way
    unmount = null;
    await waitUntilFilesystemIsOfType(
      unionfs.lower,
      unionfs?.waitLowerFilesystemType,
    );
  } else {
    // we mount it outselvs.
    ({ unmount } = await mount({
      remote,
      path: homeMountPoint,
      ...options,
      connectOptions: {
        perMessageDeflate: false,
        headers,
        ...options.connectOptions,
      },
      mountOptions: {
        allowOther: true,
        nonEmpty: true,
        ...options.mountOptions,
      },
      cacheTimeout,
      readTracking: readTrackingPath
        ? { path: readTrackingPath, timeout: 15, interval: 5 }
        : undefined,
    }));
  }

  let cache;
  if (unionfs != null) {
    if (/\s/.test(unionfs.lower) || /\s/.test(unionfs.upper)) {
      throw Error("paths cannot contain whitespace");
    }
    // unionfs-fuse -o allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768 /upper=RW:/home/user=RO /merged
    await execa("unionfs-fuse", [
      "-o",
      "allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768",
      `${unionfs.upper}=RW:${unionfs.lower}=RO`,
      path,
    ]);
    cache = filesystemCache({
      lower: unionfs.lower,
      upper: unionfs.upper,
      mount: path,
      project_id,
      compute_server_id,
      syncInterval,
      exclude,
      readTrackingPath,
    });
  } else {
    cache = null;
  }

  return async () => {
    if (cache != null) {
      await cache.close();
    }
    if (unionfs != null) {
      const args = ["-uz", path];
      logger.debug("fusermount", args.join(" "));
      await execa("fusermount", args);
    }
    if (unmount != null) {
      logger.debug("unmount");
      unmount();
    }
  };
}
