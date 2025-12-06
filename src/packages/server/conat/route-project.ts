import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import LRU from "lru-cache";
import { isValidUUID } from "@cocalc/util/misc";

const log = getLogger("server:conat:route-project");

const CHANNEL = "project_host_update";

const projectCache = new LRU<string, string>({
  max: 10_000,
  ttl: 5 * 60_000, // 5 minutes
});

const hostCache = new LRU<string, string>({
  max: 2_000,
  ttl: 5 * 60_000,
});

const inflight: Partial<Record<string, Promise<void>>> = {};
let listenerStarted: boolean = false;

function extractProjectId(subject: string): string | undefined {
  // there's a similar function in the frontend in src/packages/frontend/conat/client.ts
  // but it only handles routes the frontend should know about.
  if (subject.startsWith("project.")) {
    const project_id = subject.split(".")[1];
    if (isValidUUID(project_id)) return project_id;
    return undefined;
  }
  if (subject.startsWith("file-server.")) {
    const project_id = subject.split(".")[1];
    if (isValidUUID(project_id)) return project_id;
    return undefined;
  }
  const v = subject.split(".");
  if (v[1]?.startsWith("project-")) {
    const project_id = v[1].slice("project-".length);
    if (isValidUUID(project_id)) return project_id;
  }
  return undefined;
}

function extractHostId(subject: string): string | undefined {
  if (subject.startsWith("project-host.")) {
    const host_id = subject.split(".")[1];
    if (isValidUUID(host_id)) return host_id;
  }
  return undefined;
}

function cacheProject(project_id: string, host?: any) {
  let address: string | undefined;
  if (typeof host === "string") {
    address = host;
  } else if (host && typeof host === "object") {
    address = host.internal_url ?? host.public_url;
  }
  if (!address) {
    projectCache.delete(project_id);
    return;
  }
  projectCache.set(project_id, address);
}

function cacheHostAddress(host_id: string, host?: any) {
  let address: string | undefined;
  if (typeof host === "string") {
    address = host;
  } else if (host && typeof host === "object") {
    address = host.internal_url ?? host.public_url;
  }
  if (!address) {
    hostCache.delete(host_id);
    return;
  }
  hostCache.set(host_id, address);
}

async function fetchHostAddress(project_id: string): Promise<string | undefined> {
  if (inflight[project_id]) {
    await inflight[project_id];
    return projectCache.get(project_id);
  }
  inflight[project_id] = (async () => {
    try {
      const { rows } = await getPool().query(
        `
          SELECT host->>'internal_url' AS internal_url,
                 host->>'public_url'   AS public_url
          FROM projects
          WHERE project_id=$1
        `,
        [project_id],
      );
      const row = rows[0];
      cacheProject(project_id, row);
    } catch (err) {
      log.debug("fetchHostAddress failed", { project_id, err });
    } finally {
      delete inflight[project_id];
    }
  })();
  await inflight[project_id];
  return projectCache.get(project_id);
}

async function fetchProjectHost(host_id: string): Promise<string | undefined> {
  // Simple fetch; host registry updates are infrequent and TTL keeps cache fresh.
  try {
    const { rows } = await getPool().query(
      `
        SELECT internal_url, public_url
        FROM project_hosts
        WHERE id=$1
      `,
      [host_id],
    );
    const row = rows[0];
    cacheHostAddress(host_id, row);
  } catch (err) {
    log.debug("fetchProjectHost failed", { host_id, err });
  }
  return hostCache.get(host_id);
}

export function routeProjectSubject(
  subject: string,
): { address?: string } | undefined {
  const host_id = extractHostId(subject);
  if (host_id) {
    const cachedHost = hostCache.get(host_id);
    if (cachedHost) return { address: cachedHost };
    void fetchProjectHost(host_id);
    return;
  }

  const project_id = extractProjectId(subject);
  if (!project_id) {
    // log.debug("routeProjectSubject: not a project subject", subject);
    return;
  }

  const cached = projectCache.get(project_id);
  if (cached) {
    // log.debug("routeProjectSubject: cached", { subject, cached });
    return { address: cached };
  }

  // Fire and forget fill; fall back to default connection until cached.
  void fetchHostAddress(project_id);
  return;
}

function handleNotification(msg: { channel: string; payload?: string | null }) {
  if (msg.channel !== CHANNEL || !msg.payload) return;
  try {
    const payload = JSON.parse(msg.payload);
    const { project_id, host } = payload;
    if (!project_id || !isValidUUID(project_id)) return;
    cacheProject(project_id, host);
  } catch (err) {
    log.debug("handleNotification parse failed", { err, payload: msg.payload });
  }
}

export async function listenForUpdates() {
  if (listenerStarted) return;
  listenerStarted = true;
  const pool = getPool();

  async function connect() {
    let client: any | undefined;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      client?.removeAllListeners();
      // release is safe to call once; ignore errors if connection is already gone
      try {
        client?.release();
      } catch (err) {
        log.debug("project_host_update listener release failed", err);
      }
    };
    try {
      client = await pool.connect();
      client.on("notification", handleNotification);
      client.on("error", (err) => {
        log.warn("project_host_update listener error", err);
        cleanup();
        setTimeout(connect, 1000).unref?.();
      });
      client.on("end", () => {
        cleanup();
        setTimeout(connect, 1000).unref?.();
      });
      await client.query(`LISTEN ${CHANNEL}`);
      log.debug("listening for project host updates");
    } catch (err) {
      cleanup();
      log.warn("failed to start project_host_update listener", err);
      setTimeout(connect, 1000).unref?.();
    }
  }

  void connect();
}

export async function notifyProjectHostUpdate(opts: {
  project_id: string;
  host?: any;
  host_id?: string;
}) {
  try {
    await getPool().query(`NOTIFY ${CHANNEL}, $1`, [
      JSON.stringify(opts),
    ]);
  } catch (err) {
    log.debug("notifyProjectHostUpdate failed", { opts, err });
  }
}

export async function materializeProjectHost(
  project_id: string,
): Promise<string | undefined> {
  const cached = projectCache.get(project_id);
  if (cached) return cached;
  return await fetchHostAddress(project_id);
}
