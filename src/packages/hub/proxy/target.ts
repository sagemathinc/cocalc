/*
Given a URL that we need to proxy, determine the target (host and port)
that is being proxied.

Throws an error if anything goes wrong, e.g., user doesn't have access
to this target or the target project isn't running.
*/

import LRU from "lru-cache";

import getLogger from "@cocalc/hub/logger";
import { getDatabase } from "@cocalc/hub/servers/database";
import { ProjectControlFunction } from "@cocalc/server/projects/control";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { NamedServerName } from "@cocalc/util/types/servers";
import hasAccess from "./check-for-access-to-project";
import { parseReq } from "./parse";

const hub_projects = require("../projects");

const logger = getLogger("proxy:target");

// The cached entries expire after 30 seconds.  Caching the target
// helps enormously when there is a burst of requests.
// Also if a project restarts, the browser port might change and we
// don't want to have to fix this via getting an error.

// Also, if the project stops and starts, the host=ip address could
// change, so we need to timeout so we see that thange.

const cache = new LRU<
  string,
  {
    host: string;
    port: number;
    internal_url: string | undefined;
  }
>({ max: 20000, ttl: 1000 * 30 });

// This gets explicitly called from outside when certain errors occur.
export function invalidateTargetCache(remember_me: string, url: string): void {
  const { key } = parseReq(url, remember_me);
  logger.debug("invalidateCache:", url);
  cache.delete(key);
}

interface Options {
  remember_me?: string; // undefined = allow; only used for websocket upgrade.
  api_key?: string;
  url: string;
  isPersonal: boolean;
  projectControl: ProjectControlFunction;
  parsed?: ReturnType<typeof parseReq>;
}

export async function getTarget({
  remember_me,
  api_key,
  url,
  isPersonal,
  projectControl,
  parsed,
}: Options): Promise<{
  host: string;
  port: number;
  internal_url: string | undefined;
}> {
  const { key, type, project_id, port_desc, internal_url } =
    parsed ?? parseReq(url, remember_me, api_key);

  if (cache.has(key)) {
    return cache.get(key) as any;
  }
  // NOTE: do not log the key, since then logs leak way for
  // an attacker to get in.
  const dbg = logger.debug;
  dbg("url", url);

  // For now, we always require write access to proxy.
  // We no longer have a notion of "read access" to projects,
  // instead focusing on public sharing, cloning, etc.
  if (
    !(await hasAccess({
      project_id,
      remember_me,
      api_key,
      type: "write",
      isPersonal,
    }))
  ) {
    throw Error(`user does not have write access to project`);
  }

  const database = getDatabase();
  const project = projectControl(project_id);
  let state = await project.state();
  let host = state.ip;
  dbg("host", host);
  if (
    port_desc === "jupyter" || // Jupyter Classic
    port_desc === "jupyterlab" || // JupyterLab
    port_desc === "code" || // VSCode = "code-server"
    port_desc === "rserver"
  ) {
    if (host == null || state.state !== "running") {
      // We just start the project.
      // This is used specifically by Juno, but also makes it
      // easier to continually use Jupyter/Lab without having
      // to worry about the cocalc project.
      dbg(
        "project not running and jupyter requested, so starting to run",
        port_desc,
      );
      await project.start();
      state = await project.state();
      host = state.ip;
    } else {
      // Touch project so it doesn't idle timeout
      database.touch_project({ project_id });
    }
  }

  // https://github.com/sagemathinc/cocalc/issues/7009#issuecomment-1781950765
  if (host === "localhost") {
    if (
      port_desc === "jupyter" || // Jupyter Classic
      port_desc === "jupyterlab" || // JupyterLab
      port_desc === "code" || // VSCode = "code-server"
      port_desc === "rstudio" // RStudio Server
    ) {
      host = "127.0.0.1";
    }
  }

  if (host == null) {
    throw Error("host is undefined -- project not running");
  }

  if (state.state !== "running") {
    throw Error("project is not running");
  }

  let port: number;
  if (type === "port" || type === "server") {
    port = parseInt(port_desc);
    if (!Number.isInteger(port)) {
      dbg("determining name=", port_desc, "server port...");
      port = await namedServerPort(project_id, port_desc, projectControl);
      dbg("got named server name=", port_desc, " port=", port);
    }
  } else if (type === "raw") {
    const status = await project.status();
    // connection to the HTTP server in the project that serves web browsers
    if (status["browser-server.port"]) {
      port = status["browser-server.port"];
    } else {
      throw Error(
        "project browser server port not available -- project might not be opened or running",
      );
    }
  } else {
    throw Error(`unknown url type -- ${type}`);
  }

  dbg("finished: ", { host, port, type });
  const target = { host, port, internal_url };
  cache.set(key, target);
  return target;
}

// cache the chosen port for up to 30 seconds, since getting it
// from the project can be expensive.
const namedServerPortCache = new LRU<string, number>({
  max: 10000,
  ttl: 1000 * 20,
});

async function _namedServerPort(
  project_id: string,
  name: NamedServerName,
  projectControl,
): Promise<number> {
  const key = project_id + name;
  const p = namedServerPortCache.get(key);
  if (p) {
    return p;
  }
  const database = getDatabase();
  const project = hub_projects.new_project(
    // NOT @cocalc/server/projects/control like above...
    project_id,
    database,
    projectControl,
  );
  const port = await project.named_server_port(name);
  namedServerPortCache.set(key, port);
  return port;
}

const namedServerPort = reuseInFlight(_namedServerPort, {
  createKey: (args) => args[0] + args[1],
});
