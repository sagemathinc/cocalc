import { findAll } from "kernelspecs";
const { field_cmp } = require("smc-util/misc");
import LRU from "lru-cache";

const cache = LRU({ maxAge: 5000 });

export async function get_kernel_data(): Promise<any> {
  let kernel_data = cache.get("kernel_data");
  if (kernel_data != null) {
    return kernel_data;
  }
  const ks = await kernelspecs.findAll();
  kernel_data = { kernelspecs: ks };
  const v: any[] = [];
  for (let kernel in _kernel_data.kernelspecs) {
    const value = _kernel_data.kernelspecs[kernel];
    v.push({
      name: kernel,
      display_name: value.spec.display_name,
      language: value.spec.language
    });
  }
  v.sort(field_cmp("display_name"));
  kernel_data.jupyter_kernels = v;
  kernel_data.jupyter_kernels_json = JSON.stringify(
    kernel_data.jupyter_kernels
  );
  cache.set("kernel_data", kernel_data);
  return kernel_data;
}
