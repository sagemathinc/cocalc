export { jupyter_strip_notebook as stripNotebook } from "@cocalc/jupyter/nbgrader/jupyter-parse";
export { jupyter_run_notebook as runNotebook } from "@cocalc/jupyter/nbgrader/jupyter-run";
export { nbconvert } from "../../jupyter/convert";
export { formatString } from "../../formatters";
export { logo as kernelLogo } from "@cocalc/jupyter/kernel/logo";
export { get_kernel_data as kernels } from "@cocalc/jupyter/kernel/kernel-data";
export { newFile } from "@cocalc/backend/misc/new-file";
import { getClient } from "@cocalc/project/client";
import { project_id } from "@cocalc/project/data";
import * as control from "@cocalc/jupyter/control";
import { SandboxedFilesystem } from "@cocalc/backend/files/sandbox";

let fs: SandboxedFilesystem | null = null;
export async function start(path: string) {
  if (control.isRunning(path)) {
    return;
  }
  fs ??= new SandboxedFilesystem(process.env.HOME ?? "/tmp", {
    unsafeMode: true,
  });
  await control.start({ project_id, path, client: getClient(), fs });
}

// IMPORTANT: run is NOT used directly by the API, but instead by packages/project/conat/jupyter.ts
// It is convenient to have it here so it can call start above, etc.  The reason is because
// this returns an async iterator managed using a dedicated socket, and the api is request/response,
// so it can't just be part of the normal api.
export async function run(opts: {
  path: string;
  cells: { id: string; input: string }[];
}) {
  await start(opts.path);
  return await control.run(opts);
}

export async function stop(path: string) {
  await control.stop({ path });
}

export async function introspect(opts) {
  await start(opts.path);
  return await control.introspect(opts);
}

export async function complete(opts) {
  await start(opts.path);
  return await control.complete(opts);
}

export async function signal(opts) {
  if (!control.isRunning(opts.path)) {
    return;
  }
  await control.signal(opts);
}
