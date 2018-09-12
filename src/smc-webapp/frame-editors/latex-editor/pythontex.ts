/*
Run PythonTeX
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";

// export async function sagetex_hash(
//   project_id: string,
//   path: string,
//   time: number,
//   status: Function
// ): Promise<string> {
//   const { base, directory } = parse_path(path); // base, directory, filename
//   const s = sagetex_file(base);
//   status(`sha1sum ${s}`);
//   const output = await exec({
//     allow_post: true, // very quick computation of sha1 hash
//     timeout: 10,
//     command: "sha1sum",
//     args: [s],
//     project_id: project_id,
//     path: directory,base
//     err_on_exit: true,
//     aggregate: time
//   });
//   return output.stdout.split(" ")[0];
// }

// command documentation
//
// we limit the number of jobs, could be bad for memory usage causing OOM or whatnot
// -j N, --jobs N        Allow N jobs at once; defaults to cpu_count().

export async function pythontex(
  project_id: string,
  path: string,
  hash: string,
  status: Function
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path);
  const args = ["--jobs", "2", base];
  status(`pythontex ${args.join(" ")}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run this
    timeout: 360,
    bash: true, // timeout is enforced by ulimit
    command: "pythontex3",
    args: args,
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: hash ? { value: hash } : undefined
  });
}
