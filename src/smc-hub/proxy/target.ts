/*
Given a URL that we need to proxy, determine the target (host and port)
that is being proxied.

Throws an error if anything goes wrong, e.g., user doesn't have access
to this target or the target project isn't running.
*/

import LRU from "lru-cache";
import { parseReq } from "./parse";
import getLogger from "../logger";
import hasAccess from "./check-for-access-to-project";
const hub_projects = require("../projects");
import { database } from "../servers/database";
import { ProjectControlFunction } from "smc-hub/servers/project-control";
import { reuseInFlight } from "async-await-utils/hof";

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

  const project = projectControl(project_id);
  let state = await project.state();
  let host = state.ip;
  dbg(`host=${host}`);
  if (
    port_desc == "jupyter" || // Jupyter Classic
    port_desc == "jupyterlab" || // JupyterLab
    port_desc == "code" // VSCode = "code-server"
  ) {
    if (host == null || state.state != "running") {
      // We just start the project.
      // This is used specifically by Juno, but also makes it
      // easier to continually use Jupyter/Lab without having
      // to worry about the cocalc project.
      dbg(
        `project not running and jupyter requested, so starting to run ${port_desc}`
      );
      await project.start();
      state = await project.state();
      host = state.ip;
    } else {
      // Touch project so it doesn't idle timeout
      database.touch_project({ project_id });
    }
  }

  if (host == null) {
    throw Error("host is undefined -- project not running");
  }
  if (state.state != "running") {
    throw Error("project is not running");
  }

  let port: number;
  if (type === "port" || type === "server") {
    port = parseInt(port_desc);
    if (!Number.isInteger(port)) {
      dbg(`determining name=${port_desc} server port...`);
      port = await namedServerPort(project_id, port_desc, projectControl);
      dbg(`got named server name=${port_desc} port=${port}`);
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

// cache the chosen port for up to 30 seconds, since getting it
// from the project can be expensive.
const namedServerPortCache = new LRU<string, number>({
  max: 10000,
  maxAge: 1000 * 20,
});

async function _namedServerPort(
  project_id: string,
  name: string,
  projectControl
): Promise<number> {
  const key = project_id + name;
  const p = namedServerPortCache.get(key);
  if (p) {
    return p;
  }
  const project = hub_projects.new_project(
    // NOT project-control like above...
    project_id,
    database,
    projectControl
  );
  const port = await project.named_server_port(name);
  namedServerPortCache.set(key, port);
  return port;
}

const namedServerPort = reuseInFlight(_namedServerPort, {
  createKey: (args) => args[0] + args[1],
});
