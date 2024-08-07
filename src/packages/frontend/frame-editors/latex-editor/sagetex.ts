/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Run sagetex

- TODO: this might be better done always as part of latexmk; not sure.
*/

import { parse_path } from "@cocalc/frontend/frame-editors/frame-tree/util";
import {
  exec,
  ExecOutput,
} from "@cocalc/frontend/frame-editors/generic/client";
import { TIMEOUT_CALLING_PROJECT } from "@cocalc/util/consts/project";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { TIMEOUT_LATEX_JOB_S } from "./constants";
import { Error as ErrorLog, ProcessedLatexLog } from "./latex-log-parser";
import { BuildLog } from "./types";

function sagetex_file(base: string): string {
  return base + ".sagetex.sage";
}

export async function sagetex_hash(
  project_id: string,
  path: string,
  time: number,
  status: Function,
  output_directory: string | undefined,
): Promise<string> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sha1sum ${s}`);
  const output = await exec({
    timeout: 10,
    command: "sha1sum",
    args: [s],
    project_id: project_id,
    path: output_directory || directory,
    err_on_exit: true,
    aggregate: time,
  });
  return output.stdout.split(" ")[0];
}

export async function sagetex(
  project_id: string,
  path: string,
  hash: string,
  status: Function,
  output_directory: string | undefined,
  set_job_info: (info: ExecuteCodeOutputAsync) => void,
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sage ${s}`);
  const job_info = await exec({
    timeout: TIMEOUT_LATEX_JOB_S,
    bash: true, // so timeout is enforced by ulimit
    command: "sage",
    args: [s],
    project_id: project_id,
    path: output_directory || directory,
    err_on_exit: false,
    aggregate: hash ? { value: hash } : undefined,
    async_call: true,
  });

  if (job_info.type !== "async") {
    // this is not an async job. This could happen for old projects.
    return job_info;
  }

  set_job_info(job_info);

  while (true) {
    try {
      const output = await exec({
        project_id,
        async_get: job_info.job_id,
        async_await: true,
        async_stats: true,
      });
      if (output.type !== "async") {
        throw new Error("output type is not async exec");
      }
      set_job_info(output);
      return output;
    } catch (err) {
      if (err === TIMEOUT_CALLING_PROJECT) {
        // this will be fine, hopefully. We continue trying to get a reply.
        await new Promise((done) => setTimeout(done, 100));
      } else {
        throw err;
      }
    }
  }
}

/* example error
 *
 *    File "sagetex.sagetex.sage.py", line 16
 *     _st_.inline(_sage_const_1 , latex(_sage_const_3p2 .2))
 *                                                        ^
 * SyntaxError: invalid
 */

export function sagetex_errors(
  file: string,
  output: BuildLog,
): ProcessedLatexLog {
  const pll = new ProcessedLatexLog();

  let err: ErrorLog | undefined = undefined;

  // all fine
  if (output.stderr.indexOf("Sage processing complete") >= 0) {
    return pll;
  }

  for (const line of output.stderr.split("\n")) {
    if (line.trim().length > 0) {
      // we create an error and then we collect lines
      if (err == null) {
        err = {
          line: null,
          file,
          level: "error",
          message: line,
          content: "",
          raw: "",
        };
        pll.errors.push(err);
        pll.all.push(err);
      }
      err.content += `${line}\n`;
      // last line is probably the most interesting one
      err.message = line;
    } else {
      // end of block
      err = undefined;
    }
  }
  return pll;
}
