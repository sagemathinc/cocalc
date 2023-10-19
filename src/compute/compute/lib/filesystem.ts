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
  unionfs?: { upper: string; lower: string };
  compute_server_id?: number;
}

export async function mountProject({
  project_id = process.env.PROJECT_ID,
  path = "/home/user", // where to mount the project's HOME directory
  unionfs,
  options,
  compute_server_id = parseInt(process.env.COMPUTE_SERVER_ID ?? "0"),
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
  }

  const { unmount } = await mount({
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
  });

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
      cacheTimeout: 15,
    });
  } else {
    cache = null;
  }

  return async () => {
    if (cache != null) {
      await cache.close();
    }
    if (unionfs != null) {
      await execa("fusermount", ["-u", path]);
    }
    unmount();
  };
}
