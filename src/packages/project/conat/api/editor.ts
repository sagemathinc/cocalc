export { jupyter_strip_notebook as jupyterStripNotebook } from "@cocalc/jupyter/nbgrader/jupyter-parse";
export { jupyter_run_notebook as jupyterRunNotebook } from "@cocalc/jupyter/nbgrader/jupyter-run";
export { nbconvert as jupyterNbconvert } from "../../jupyter/convert";
export { formatString } from "../../formatters";
export { logo as jupyterKernelLogo } from "@cocalc/jupyter/kernel/logo";
export { get_kernel_data as jupyterKernels } from "@cocalc/jupyter/kernel/kernel-data";
export { newFile } from "@cocalc/backend/misc/new-file";

import { printSageWS as printSageWS0 } from "@cocalc/project/print_to_pdf";
export { sagewsStart, sagewsStop } from "@cocalc/project/sagews/control";

import { filename_extension } from "@cocalc/util/misc";
export async function printSageWS(opts): Promise<string> {
  let pdf;
  const ext = filename_extension(opts.path);
  if (ext) {
    pdf = `${opts.path.slice(0, opts.path.length - ext.length)}pdf`;
  } else {
    pdf = opts.path + ".pdf";
  }

  await printSageWS0({
    path: opts.path,
    outfile: pdf,
    title: opts.options?.title,
    author: opts.options?.author,
    date: opts.options?.date,
    contents: opts.options?.contents,
    subdir: opts.options?.subdir,
    extra_data: opts.options?.extra_data,
    timeout: opts.options?.timeout,
  });
  return pdf;
}

export { createTerminalService } from "@cocalc/project/conat/terminal";

import { getClient } from "@cocalc/project/client";
import { project_id } from "@cocalc/project/data";
import * as control from "@cocalc/jupyter/control";
import { SandboxedFilesystem } from "@cocalc/backend/files/sandbox";

export async function jupyterStart(path: string) {
  const fs = new SandboxedFilesystem(process.env.HOME ?? "/tmp", {
    unsafeMode: true,
  });
  await control.jupyterStart({ project_id, path, client: getClient(), fs });
}

export async function jupyterRun(
  path: string,
  cells: { id: string; input: string }[],
) {
  await jupyterStart(path);
  return await control.jupyterRun({ path, cells });
}

export async function jupyterStop(path: string) {
  await control.jupyterStop({ path });
}
