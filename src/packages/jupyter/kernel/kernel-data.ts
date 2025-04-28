/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Use nteracts kernelspecs module to get data about all installed Jupyter kernels.

The result is cached for a few seconds to avoid wasted effort in case
of a flurry of calls.

Specs: https://jupyter-client.readthedocs.io/en/stable/kernels.html#kernel-specs

This is supposed to be basically the same as "jupyter kernelspec list --json", but it is NOT always.
E.g., on my dev system the "ptyhon3" system-wide kernel is just completely missed.  Also,
"jupyter kernelspec list --json" is MUCH slower, taking almost a second, versus only
a few ms for this.  We stick with this for now, but may need to improve upstream.
*/

import { findAll } from "kernelspecs";
import LRU from "lru-cache";
import type { KernelSpec } from "@cocalc/jupyter/types/types";
import { field_cmp } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const cache = new LRU<"kernel_data", KernelSpec[]>({
  ttl: 15 * 1000,
  max: 5 /* silly since only one possible key */,
});

/**
 * just an edge case for Macaulay2. Full data looks like this:
 * m2: {
    name: 'm2',
    files: [ ... ],
    resources_dir: '...',
    spec: {
      argv: [...],
      display_name: 'M2',
      language: 'text/x-macaulay2',
      codemirror_mode: 'macaulay2'
    }
  },
 */
function spec2language(spec): string {
  if (spec.language === "text/x-macaulay2") {
    return "Macaulay2";
  } else {
    return spec.language;
  }
}

// this is very expensive and can get called many times at once before
// the cache is set, which is very bad... so reuseInFlight.
export const get_kernel_data = reuseInFlight(
  async ({ noCache }: { noCache?: boolean } = {}): Promise<KernelSpec[]> => {
    if (!noCache) {
      let x = cache.get("kernel_data");
      if (x != null) {
        return x;
      }
    }
    const kernel_data = await findAll();
    const v: KernelSpec[] = [];
    for (const kernel in kernel_data) {
      const value = kernel_data[kernel];
      v.push({
        name: kernel.toLowerCase(),
        display_name: value.spec.display_name,
        language: spec2language(value.spec),
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
  },
);

export async function getLanguage(kernelName: string): Promise<string> {
  const kernelSpec = await get_kernel_data_by_name(kernelName);
  if (kernelSpec != null) {
    return kernelSpec.language;
  }
  throw Error(`unknown kernel ${kernelName}`);
}

export async function get_kernel_data_by_name(
  name: string,
): Promise<KernelSpec> {
  name = name.toLowerCase();
  const kernel_data = await get_kernel_data();
  for (const kernel of kernel_data) {
    if (kernel.name == name) {
      return kernel;
    }
  }
  throw Error(`no such kernel '${name}'`);
}
