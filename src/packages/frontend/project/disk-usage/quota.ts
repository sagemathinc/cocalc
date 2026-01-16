import { webapp_client } from "@cocalc/frontend/webapp-client";
import TTLCache from "@isaacs/ttlcache";

const quotaCache = new TTLCache<string, { size: number; used: number }>({
  ttl: 1000 * 60,
});

export function key({ project_id }: { project_id: string }) {
  return `${project_id}-0`;
}

export default async function quota({
  project_id,
  cache = true,
}: {
  project_id: string;
  cache?: boolean;
}): Promise<{
  // bytes used of HARD quota (= 100% instantly strict, but after compression)
  used: number;
  // bytes of HARD quota
  size: number;
  cache?: boolean;
}> {
  const k = key({ project_id });
  if (cache && quotaCache.has(k)) {
    return quotaCache.get(k)!;
  }
  const x = await webapp_client.conat_client.hub.projects.getDiskQuota({
    project_id,
    compute_server_id: 0,
  });
  quotaCache.set(k, x);
  return x;
}
