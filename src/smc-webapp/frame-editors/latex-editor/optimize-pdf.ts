/*
Optimize PDF file using tools like qpdf
*/

import { exec, ExecOutput } from "../generic/client";
import { path_split } from "smc-util/misc2";
import { pdf_path } from "./util";

export async function optimize_pdf(
  project_id: string,
  path: string,
  time: number | undefined // (ms since epoch)  used to aggregate multiple calls into one across all users.
): Promise<void> {
  await linearize_pdf(project_id, path, time);
}

async function linearize_pdf(
  project_id: string,
  path: string,
  time: number | undefined
): Promise<ExecOutput | undefined> {
  const x = path_split(path);
  const pdf_fn = pdf_path(x.tail);
  const tmp_fn = `{pdf_fn}.tmp`;
  const args = ["--linearize", pdf_fn, tmp_fn];
  let qpdf_output: ExecOutput | undefined = undefined;
  try {
    qpdf_output = await exec({
      command: "qpdf",
      args,
      project_id,
      path: x.head,
      err_on_exit: true,
      timeout: 10, // 10 secs, this tool runs very fast
      aggregate: time
    });

    console.log(`qpdf:`, qpdf_output);

    await exec({
      project_id,
      bash: false,
      allow_post: true,
      command: "mv",
      path: x.head,
      args: [tmp_fn, pdf_fn]
    });
  } catch (err) {
    // good reasons this could fail (due to err_on_exit above)
  }
  return qpdf_output;
}
