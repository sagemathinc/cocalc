export { formatString } from "../../formatters";

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
