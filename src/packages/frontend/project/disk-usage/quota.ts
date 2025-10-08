import { webapp_client } from "@cocalc/frontend/webapp-client";
import TTLCache from "@isaacs/ttlcache";

const quotaCache = new TTLCache<string, { size: number; used: number }>({
  ttl: 1000 * 60,
});

export function key({ project_id, compute_server_id }) {
  return `${project_id}-${compute_server_id}`;
}

export default async function quota({
  project_id,
  compute_server_id = 0,
  cache = true,
}): Promise<{
  // bytes used of HARD quota (= 100% instantly strict, but after compression)
  used: number;
  // bytes of HARD quota
  size: number;
  cache?: boolean;
}> {
  const k = key({ project_id, compute_server_id });
  if (cache && quotaCache.has(k)) {
    return quotaCache.get(k)!;
  }
  const x = await webapp_client.conat_client.hub.projects.getDiskQuota({
    project_id,
    compute_server_id,
  });
  quotaCache.set(k, x);
  return x;
}
