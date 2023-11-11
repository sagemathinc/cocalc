/*
Mount a remote CoCalc project's filesystem locally over a websocket using FUSE.

 await require('.').mount({remote:'wss://cocalc.com/10f0e544-313c-4efe-8718-2142ac97ad11/raw/.smc/websocketfs',path:process.env.HOME + '/dev2', connectOptions:{perMessageDeflate: false,  headers: {Cookie: require('cookie').serialize('api_key', 'sk-at7ALcGBKMbzq7Vc00000P')}}})


*/

import { apiKey } from "@cocalc/backend/data";
import { mount } from "websocketfs";
import getLogger from "@cocalc/backend/logger";
import { project } from "@cocalc/api-client";
import { serialize } from "cookie";
import { join } from "path";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import syncFS from "@cocalc/sync-fs";
import { waitUntilFilesystemIsOfType, getProjectWebsocketUrl } from "./util";
import { apiCall } from "@cocalc/api-client";

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
  syncIntervalMin?: number;
  syncIntervalMax?: number;
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
  syncIntervalMin,
  syncIntervalMax,
  exclude = [],
  readTrackingPath,
}: Options = {}) {
  const log = (...args) => logger.debug(path, ...args);
  const reportState = async (
    type: "cache" | "network" | "filesystem",
    opts: { state; extra?; timeout?; progress? },
  ) => {
    log("reportState", { type, opts });
    try {
      await apiCall("v2/compute/set-detailed-state", {
        id: compute_server_id,
        name: type == "filesystem" ? "filesystem" : `filesystem-${type}`,
        ...opts,
      });
    } catch (err) {
      log("reportState: WARNING -- ", err);
    }
  };
  log();
  try {
    if (!compute_server_id) {
      throw Error("set the compute_server_id or process.env.COMPUTE_SERVER_ID");
    }
    if (!project_id) {
      throw Error("project_id or process.env.PROJECT_ID must be given");
    }
    if (!apiKey) {
      throw Error("api key must be set (e.g., set API_KEY env variable)");
    }

    // Ping to start project so it's possible to mount.
    await project.ping({ project_id });

    const remote = join(getProjectWebsocketUrl(project_id), "websocketfs");
    log("connecting to ", remote);
    const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
    // SECURITY: DO NOT log headers and connectOptions, obviously!

    let homeMountPoint;
    if (unionfs == null) {
      homeMountPoint = path;
    } else {
      homeMountPoint = unionfs.lower;
      if (!unionfs.lower || !unionfs.upper) {
        throw Error(
          "if unionfs is specified, both lower and upper must be set",
        );
      }
    }

    let unmount;
    let pingInterval: null | ReturnType<typeof setInterval> = null;
    if (unionfs?.waitLowerFilesystemType) {
      // we just wait for it to get mounted in some other way
      unmount = null;
      reportState("cache", {
        state: "waiting",
        extra: `for ${unionfs.lower}`,
        timeout: 120,
        progress: 30,
      });
      await waitUntilFilesystemIsOfType(
        unionfs.lower,
        unionfs?.waitLowerFilesystemType,
      );
    } else {
      // we mount it ourselves.
      reportState("network", {
        state: "mounting",
        extra: remote,
        timeout: 120,
        progress: 30,
      });

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
        hidePath: "/.unionfs",
        readTracking: readTrackingPath
          ? { path: readTrackingPath, timeout: 15, interval: 5 }
          : undefined,
      }));
      pingInterval = setInterval(async () => {
        try {
          await project.ping({ project_id });
          log("ping project -- SUCCESS");
        } catch (err) {
          log(`ping project -- ERROR '${err}'`);
        }
      }, 30000);
      reportState("network", { state: "ready", progress: 100 });
    }

    let syncfs;
    if (unionfs != null) {
      if (/\s/.test(unionfs.lower) || /\s/.test(unionfs.upper)) {
        throw Error("paths cannot contain whitespace");
      }

      syncfs = syncFS({
        lower: unionfs.lower,
        upper: unionfs.upper,
        mount: path,
        project_id,
        compute_server_id,
        syncIntervalMin,
        syncIntervalMax,
        exclude,
        readTrackingPath,
      });
      await syncfs.init();
      reportState("cache", { state: "ready", progress: 100 });
    } else {
      syncfs = null;
    }

    reportState("filesystem", { state: "ready", progress: 100 });

    return {
      syncfs,
      unmount: async () => {
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (syncfs != null) {
          await syncfs.close();
        }
        if (unmount != null) {
          logger.debug("unmount");
          unmount();
        }
      },
    };
  } catch (err) {
    const e = `${err}`;
    reportState(unionfs != null ? "cache" : "network", {
      state: "error",
      extra: e,
    });
    log(e);
    throw err;
  }
}
