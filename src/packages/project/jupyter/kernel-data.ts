/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use nteracts kernelspecs module to get data about all installed Jupyter kernels.

The result is cached for 10s to avoid wasted effort in case of a flurry of calls.

Specs: https://jupyter-client.readthedocs.io/en/stable/kernels.html#kernel-specs
*/

import { findAll } from "kernelspecs";
import LRU from "lru-cache";

import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import { field_cmp } from "@cocalc/util/misc";

const cache = new LRU<"kernel_data", KernelSpec[]>({
  ttl: 10 * 1000,
  max: 5 /* silly since only one possible key */,
});

export async function get_kernel_data(): Promise<KernelSpec[]> {
  let x = cache.get("kernel_data");
  if (x != null) {
    return x;
  }
  const kernel_data = await findAll();
  const v: KernelSpec[] = [];
  for (const kernel in kernel_data) {
    const value = kernel_data[kernel];
    v.push({
      name: kernel,
      display_name: value.spec.display_name,
      language: value.spec.language,
      // @ts-ignore
      interrupt_mode: value.spec.interrupt_mode,
      env: value.spec.env ?? {},
      // @ts-ignore
      metadata: value.spec.metadata,
      // kernelspecs incorrectly calls it resources_dir instead of resource_dir.
      // See https://github.com/nteract/kernelspecs/issues/25
      // @ts-ignore
      resource_dir: value.resource_dir ?? value.resources_dir,
      argv: value.spec.argv,
    });
  }
  v.sort(field_cmp("display_name"));
  cache.set("kernel_data", v);
  return v;
}

export async function getLanguage(kernelName: string): Promise<string> {
  const kernelSpec = await get_kernel_data_by_name(kernelName);
  if (kernelSpec != null) {
    return kernelSpec.language;
  }
  throw Error(`unknown kernel ${kernelName}`);
}

export async function get_kernel_data_by_name(
  name: string
): Promise<KernelSpec> {
  const kernel_data = await get_kernel_data();
  for (const kernel of kernel_data) {
    if (kernel.name == name) {
      return kernel;
    }
  }
  throw Error(`no such kernel '${name}'`);
}
