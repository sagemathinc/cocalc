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
const winston = getLogger("proxy: target");
import hasAccess from "check-for-access-to-project";
const hub_projects = require("../projects");

// The cached entries expire after 30 seconds.  Caching the target
// helps enormously when there is a burst of requests.
// Also if a project restarts, the raw port might change and we
// don't want to have to fix this via getting an error.

// Also, if the project stops and starts, the host=ip address could
// change, so we need to timeout so we see that thange.

const cache = new LRU({ max: 20000, maxAge: 1000 * 30 });

// This gets explicitly called from outside when certain errors occur.
export function invalidateTargetCache(remember_me: string, url: string): void {
  const { key } = parseReq(remember_me, url);
  winston.debug(`invalidateCache: ${url}`);
  cache.del(key);
}

interface Options {
  remember_me?: string; // undefined = allow; only used for websocket upgrade.
  url: string;
  isPersonal: boolean;
  projectControl;
}

export async function getTarget(opts: Options): {
  host: string;
  port: number;
  internal_url: string;
} {
  const { remember_me, url, isPersonal, projectControl } = opts;

  const { key, type, project_id, port_desc, internal_url } = parseReq(
    remember_me,
    url
  );

  let t = cache.get(key);
  if (t != null) {
    return t;
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

  const project = await callback2(projectControl.project, { project_id });
  let { host } = project;
  if (project._kubernetes) {
    // this is ugly -- need to determine host in case of kubernetes, since
    // host as set in the project object is old/wrong.
    const status = await callback2(project.status);
    if (!status.ip) {
      throw Error("must wait for project to start");
    }
    host = status.ip;
  }
  dbg(`host=${host}`);

  if (type === "port" || type === "server") {
    if (port_desc === "jupyter") {
      dbg("determining jupyter server port...");
      port = await jupyterPort(project_id, projectControl);
      dbg(`got jupyter port=${port}`);
    } else {
      port = parseInt(port_desc);
    }
  } else if (type === "raw") {
    const status = await callback2(project.status);
    if (!status["raw.port"]) {
      throw Error(
        "raw port not available -- project might not be opened or running"
      );
    } else {
      port = status["raw.port"];
    }
  } else {
    throw Error(`unknown url type -- ${type}`);
  }

  dbg(`finished: host=${host}; port=${port}; type=${type}`);
  const t = { host, port, internal_url };
  cache.set(key, t);
  return t;
}

async function jupyterPort(project_id: string, projectControl): number {
  const project = hub_projects.new_project(
    project_id,
    database,
    projectControl
  );
  return await callback2(project.jupyter_port);
}
