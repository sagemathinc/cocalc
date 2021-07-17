/*
Given a URL that we need to proxy, determine the target (host and port)
that is being proxied.

Throws an error if anything goes wrong, e.g., user doesn't have access
to this target or the target project isn't running.
*/

import * as LRU from "lru-cache";
import { callback2 } from "smc-util/async-utils";
import { parseReq } from "./parse";
import getLogger from "../logger";
import hasAccess from "./check-for-access-to-project";
const hub_projects = require("../projects");
import { database } from "../servers/database";
import { ProjectControlFunction } from "smc-hub/servers/project-control";

const winston = getLogger("proxy: target");

// The cached entries expire after 30 seconds.  Caching the target
// helps enormously when there is a burst of requests.
// Also if a project restarts, the browser port might change and we
// don't want to have to fix this via getting an error.

// Also, if the project stops and starts, the host=ip address could
// change, so we need to timeout so we see that thange.

const cache = new LRU({ max: 20000, maxAge: 1000 * 30 });

// This gets explicitly called from outside when certain errors occur.
export function invalidateTargetCache(remember_me: string, url: string): void {
  const { key } = parseReq(url, remember_me);
  winston.debug(`invalidateCache: ${url}`);
  cache.del(key);
}

interface Options {
  remember_me?: string; // undefined = allow; only used for websocket upgrade.
  url: string;
  isPersonal: boolean;
  projectControl: ProjectControlFunction;
}

export async function getTarget(opts: Options): Promise<{
  host: string;
  port: number;
  internal_url: string | undefined;
}> {
  const { remember_me, url, isPersonal, projectControl } = opts;

  const { key, type, project_id, port_desc, internal_url } = parseReq(
    url,
    remember_me
  );

  if (cache.has(key)) {
    return cache.get(key) as any;
  }
  const dbg = (m) => winston.debug(`target(${key}): ${m}`);
  dbg(`url=${url}`);

  if (remember_me != null) {
    // For now, we always require write access to proxy.
    // We really haven't implemented a notion of "read access" to projects,
    // instead focusing on public sharing, cloning, etc.
    if (
      !(await hasAccess({ project_id, remember_me, type: "write", isPersonal }))
    ) {
      throw Error(`user does not have write access to project`);
    }
  }

  const project = await projectControl(project_id);
  const { host } = project;
  dbg(`host=${host}`);

  if (host == null) {
    throw Error("host is undefined -- project not running");
  }

  if ((await project.state()).state != "running") {
    throw Error("project is not running");
  }

  let port: number;
  if (type === "port" || type === "server") {
    if (port_desc === "jupyter") {
      dbg("determining jupyter server port...");
      port = await jupyterPort(project_id, projectControl, false);
      dbg(`got jupyter port=${port}`);
    } else if (port_desc === "jupyterlab") {
      dbg("determining jupyter server port...");
      port = await jupyterPort(project_id, projectControl, true);
      dbg(`got jupyterlab port=${port}`);
    } else {
      port = parseInt(port_desc);
    }
  } else if (type === "raw") {
    const status = await project.status();
    // connection to the HTTP server in the project that serves web browsers
    if (status["browser-server.port"]) {
      port = status["browser-server.port"];
    } else {
      throw Error(
        "project browser server port not available -- project might not be opened or running"
      );
    }
  } else {
    throw Error(`unknown url type -- ${type}`);
  }

  dbg(`finished: host=${host}; port=${port}; type=${type}`);
  const target = { host, port, internal_url };
  cache.set(key, target);
  return target;
}

async function jupyterPort(
  project_id: string,
  projectControl,
  lab: boolean
): Promise<number> {
  const project = hub_projects.new_project(
    project_id,
    database,
    projectControl
  );
  return await callback2(project.jupyter_port, { lab });
}
