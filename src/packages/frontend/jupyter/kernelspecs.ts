import LRU from "lru-cache";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { KernelSpec } from "@cocalc/jupyter/types";

const cache = new LRU<"spec", KernelSpec[]>({ max: 1, ttl: 1000 * 15 }); // 15 seconds

export default async function getKernelSpec(
  project_id: string,
): Promise<KernelSpec[]> {
  const spec = cache.get("spec");
  if (spec != null) {
    return spec;
  }
  const api = webapp_client.nats_client.projectApi({ project_id });
  const spec1 = await api.editor.jupyterKernels();
  cache.set("spec", spec1);
  return spec1;
}
