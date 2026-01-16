import LRU from "lru-cache";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { KernelSpec } from "@cocalc/jupyter/types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const cache = new LRU<string, KernelSpec[]>({
  // up to 15 workspaces cached
  max: 15,
  // cache for 5 minutes; when user explicitly clicks refresh it doesn't use cache.
  ttl: 1000 * 5 * 60,
});

const getKernelSpec = reuseInFlight(
  async ({
    project_id,
    noCache,
  }: {
    project_id: string;
    noCache?: boolean;
  }): Promise<KernelSpec[]> => {
    const key = JSON.stringify({ project_id });
    // console.log({ key, noCache });
    if (!noCache) {
      const spec = cache.get(key);
      if (spec != null) {
        return spec;
      }
    }
    const api = webapp_client.conat_client.projectApi({
      project_id,
      timeout: 7500,
    });
    const spec = await api.jupyter.kernels();
    cache.set(key, spec);
    return spec;
  },
);

export default getKernelSpec;
