import httpProxy from "http-proxy-3";
import getLogger from "../logger";
import { parseReq } from "./parse";
import getPool from "@cocalc/database/pool";
import LRU from "lru-cache";

const logger = getLogger("proxy:project-host");

type HostRow = { internal_url?: string; public_url?: string };

const cache = new LRU<string, HostRow>({ max: 10000, ttl: 60_000 });

async function getHost(project_id: string): Promise<HostRow> {
  const cached = cache.get(project_id);
  if (cached) return cached;
  const { rows } = await getPool().query(
    `
      SELECT host->>'internal_url' AS internal_url,
             host->>'public_url'   AS public_url
      FROM projects WHERE project_id=$1
    `,
    [project_id],
  );
  const row = rows[0] ?? {};
  cache.set(project_id, row);
  return row;
}

export async function createProjectHostProxyHandlers() {
  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
  });

  proxy.on("error", (err, req) => {
    logger.debug("proxy error", { err: `${err}`, url: req?.url });
  });

  async function targetFor(req): Promise<string> {
    const { project_id } = parseReq(req.url ?? "/");
    const host = await getHost(project_id);
    const base = host.internal_url || host.public_url;
    if (!base) {
      throw Error(`no host recorded for project ${project_id}`);
    }
    return `${base}${req.url}`;
  }

  const handleRequest = async (req, res) => {
    const target = await targetFor(req);
    proxy.web(req, res, { target });
  };

  const handleUpgrade = async (req, socket, head) => {
    const target = await targetFor(req);
    proxy.ws(req, socket, head, { target });
  };

  return { handleRequest, handleUpgrade };
}
