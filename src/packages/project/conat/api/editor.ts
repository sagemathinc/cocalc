export { jupyter_strip_notebook as jupyterStripNotebook } from "@cocalc/jupyter/nbgrader/jupyter-parse";
export { jupyter_run_notebook as jupyterRunNotebook } from "@cocalc/jupyter/nbgrader/jupyter-run";
export { nbconvert as jupyterNbconvert } from "../../jupyter/convert";
export { run_formatter_string as formatterString } from "../../formatters";
export { logo as jupyterKernelLogo } from "@cocalc/jupyter/kernel/logo";
export { get_kernel_data as jupyterKernels } from "@cocalc/jupyter/kernel/kernel-data";
export { newFile } from "@cocalc/backend/misc/new-file";

import { printSageWS as printSageWS0 } from "@cocalc/project/print_to_pdf";
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
