import { redux } from "@cocalc/frontend/app-framework";
import TTLCache from "@isaacs/ttlcache";

const dustCache = new TTLCache<string, any>({ ttl: 1000 * 60 });

export function key({ project_id, path, compute_server_id }) {
  return `${project_id}-${compute_server_id}-${path}`;
}

// Very Obvious TODO, depending on how we use this, which doesn't change the API:
// Just compute the entire tree once, then for any subdirectory, compute from that
// tree... until refresh or cache timeout.  Could be great... or pointless.

export default async function dust({
  project_id,
  path = "",
  compute_server_id = 0,
  cache = true,
}: {
  project_id: string;
  path?: string;
  compute_server_id?: number;
  cache?: boolean;
}) {
  const k = cache ? key({ project_id, path, compute_server_id }) : "";
  if (cache && dustCache.has(k)) {
    return dustCache.get(k);
  }
  console.log("cache miss for ", { k, cache });
  const fs = redux.getProjectActions(project_id).fs(compute_server_id);
  const { stdout, stderr, code } = await fs.dust(path, {
    options: ["-j", "-x", "-d", "1", "-s", "-o", "b", "-D"],
    timeout: 3000,
  });
  if (code) {
    throw Error(Buffer.from(stderr).toString());
  }
  let {
    size,
    name: abspath,
    children,
  } = JSON.parse(Buffer.from(stdout).toString());
  const n = abspath.length + 1;
  children = children.map(({ size, name }) => {
    return { bytes: parseInt(size.slice(0, -1)), path: name.slice(n) };
  });
  const v = { bytes: parseInt(size.slice(0, -1)), children };
  if (cache) {
    dustCache.set(k, v);
  }
  return v;
}
