/*
Wrap launch_jupyter_kernel with a pool for performance.
*/

import launchJupyterKernelNoPool, {
  LaunchJupyterOpts,
  SpawnedKernel,
} from "./launch-jupyter-kernel";

export type { LaunchJupyterOpts, SpawnedKernel };

export default async function launchJupyterKernel(
  name: string, // name of the kernel
  opts: LaunchJupyterOpts
): Promise<SpawnedKernel> {
  console.log("launchJupyterKernel", name, opts);
  return await launchJupyterKernelNoPool(name, opts);
}
