/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use nteracts kernelspecs module to get data about all installed Jupyter kernels.

The result is cached for 5s to avoid wasted effort in case of a flurry of calls.

Specs: https://jupyter-client.readthedocs.io/en/stable/kernels.html#kernel-specs
*/

import { findAll } from "kernelspecs";

// const { findAll } = require("kernelspecs");
const { field_cmp } = require("smc-util/misc");
import * as LRU from "lru-cache";

const cache = new LRU({ maxAge: 5000 });

export async function get_kernel_data(): Promise<any> {
  let kernel_data = cache.get("kernel_data");
  if (kernel_data != null) {
    return kernel_data;
  }
  const ks = await findAll();
  kernel_data = { kernelspecs: ks };
  const v: any[] = [];
  for (const kernel in kernel_data.kernelspecs) {
    const value = kernel_data.kernelspecs[kernel];
    v.push({
      name: kernel,
      display_name: value.spec.display_name,
      language: value.spec.language,
      interrupt_mode: value.spec.interrupt_mode,
      env: value.spec.env,
      metadata: value.spec.metadata,
    });
  }
  v.sort(field_cmp("display_name"));
  cache.set("kernel_data", v);
  return v;
}
