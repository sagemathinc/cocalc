import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import LRU from "lru-cache";
import { isValidUUID } from "@cocalc/util/misc";

const log = getLogger("server:conat:route-project");

const cache = new LRU<string, string>({
  max: 10_000,
  ttl: 60_000, // 1 minute
});

const inflight: Partial<Record<string, Promise<void>>> = {};

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

async function fetchHostAddress(project_id: string) {
  if (inflight[project_id]) {
    return inflight[project_id];
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
      const address = row?.internal_url || row?.public_url;
      if (address) {
        cache.set(project_id, address);
      }
    } catch (err) {
      log.debug("fetchHostAddress failed", { project_id, err });
    } finally {
      delete inflight[project_id];
    }
  })();
  return inflight[project_id];
}

export function routeProjectSubject(
  subject: string,
): { address?: string } | undefined {
  const project_id = extractProjectId(subject);
  if (!project_id) {
    // log.debug("routeProjectSubject: not a project subject", subject);
    return;
  }

  const cached = cache.get(project_id);
  if (cached) {
    // log.debug("routeProjectSubject: cached", { subject, cached });
    return { address: cached };
  }
  //log.debug("routeProjectSubject: first and forget fill", subject);

  // fire and forget fill; fall back to default connection until cached
  void fetchHostAddress(project_id);
  return;
}
