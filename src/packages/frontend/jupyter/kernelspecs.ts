import type { KernelSpec } from "@cocalc/jupyter/types";
import { get_server_url } from "./server-urls";
import LRU from "lru-cache";

const cache = new LRU<"spec", KernelSpec[]>({ max: 1, ttl: 1000 * 15 }); // 15 seconds

export default async function getKernelSpec(
  project_id: string
): Promise<KernelSpec[]> {
  const spec = cache.get("spec");
  if (spec != null) return spec;
  const url = `${get_server_url(project_id)}/kernelspecs/`;
  const spec1 = await (await fetch(url)).json();
  cache.set("spec", spec1);
  return spec1;
}
