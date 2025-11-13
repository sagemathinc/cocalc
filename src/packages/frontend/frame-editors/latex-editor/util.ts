/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// data and functions specific to the latex editor.

import { ExecOutput } from "@cocalc/frontend/frame-editors/generic/client";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { ExecOptsBlocking } from "@cocalc/util/db-schema/projects";
import { separate_file_extension } from "@cocalc/util/misc";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { TITLE_BAR_BORDER } from "../frame-tree/style";
import { TIMEOUT_LATEX_JOB_S } from "./constants";

export const OUTPUT_HEADER_STYLE = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px",
  borderBottom: TITLE_BAR_BORDER,
  backgroundColor: "white",
  flexShrink: 0,
} as const;

export function pdf_path(path: string): string {
  // if it is already a pdf, don't change the upper/lower casing -- #4562
  const { name, ext } = separate_file_extension(path);
  if (ext.toLowerCase() == "pdf") return path;
  return `${name}.pdf`;
}

/*
- cmd = the build command line
- filename - if the path to the file is 'foo/a b.tex' then this is 'a b.tex'.
*/
export function ensureTargetPathIsCorrect(
  cmd: string,
  filename: string,
): string {
  // make it so we can assume no whitespace at end:
  cmd = cmd.trim();

  // Make sure the filename is correct and is the last
  // command line argument.  Be careful since the path
  // may contain spaces.  Fortunately, the path can't
  // contain a single quote, since latex doesn't work
  // with such a file (and we have checks for this).
  // https://github.com/sagemathinc/cocalc/issues/5215
  // Also we have to automatically workaround the mess caused
  // by that bug #5215, which is why this code is more
  // complicated.
  const quoted = `'${filename}'`;

  // Now try to fix it, taking into account the fact that
  // it could be mangled because of bug #5215.  Note that single
  // quotes should have only been used to quote the final filename
  // argument to pdflatex.  The other arguments were really simple and
  // don't need quoting.
  const i = cmd.indexOf("'");
  if (i == -1) {
    // no single quotes at all -- old version.
    // replace the last argument with quoted version
    const j = cmd.lastIndexOf(" ");
    if (j == -1) {
      return cmd; // we don't do anything, e.g. this could be just "false"
    } else {
      return cmd.slice(0, j) + " " + quoted;
    }
  }

  // Get rid of whatever is between single quotes and put in the correct
  // thing (e.g., the filename may have been renamed).
  return cmd.slice(0, i).trim() + " " + quoted;
}

interface RunJobOpts {
  aggregate: ExecOptsBlocking["aggregate"];
  args?: string[];
  command: string;
  env?: { [key: string]: string };
  project_id: string;
  runDir: string; // a directory! (output_directory if in /tmp, or the directory of the file's path)
  set_job_info: (info: ExecuteCodeOutputAsync) => void;
  timeout?: number;
  path: string;
}

export async function runJob(opts: RunJobOpts): Promise<ExecOutput> {
  const {
    aggregate,
    args,
    command,
    env,
    project_id,
    runDir,
    set_job_info,
    path,
  } = opts;

  const haveArgs = Array.isArray(args);

  // Create execStream with real-time streaming
  const stream = webapp_client.project_client.execStream({
    aggregate,
    args,
    bash: !haveArgs,
    command,
    env,
    err_on_exit: false,
    path: runDir,
    project_id,
    timeout: TIMEOUT_LATEX_JOB_S,
    // Pass debug info for backend logging
    debug: `LaTeX build for: ${path}`,
  });

  return new Promise((resolve, reject) => {
    let current_job_info: ExecuteCodeOutputAsync | null = null;
    let pending_stdout = "";
    let pending_stderr = "";

    stream.on("job", (job_info: ExecuteCodeOutputAsync) => {
      current_job_info = {
        ...job_info,
        // Include any stdout/stderr that arrived before the job event
        stdout: (job_info.stdout ?? "") + pending_stdout,
        stderr: (job_info.stderr ?? "") + pending_stderr,
      };
      // Clear pending data since it's now included
      pending_stdout = "";
      pending_stderr = "";
      set_job_info(current_job_info);
    });

    stream.on("stdout", (data: string) => {
      if (current_job_info) {
        current_job_info = {
          ...current_job_info,
          stdout: (current_job_info.stdout ?? "") + data,
        };
        set_job_info(current_job_info);
      } else {
        // Job info not ready yet, accumulate data
        pending_stdout += data;
      }
    });

    stream.on("stderr", (data: string) => {
      if (current_job_info) {
        current_job_info = {
          ...current_job_info,
          stderr: (current_job_info.stderr ?? "") + data,
        };
        set_job_info(current_job_info);
      } else {
        // Job info not ready yet, accumulate data
        pending_stderr += data;
      }
    });

    stream.on("stats", (statEntry: any) => {
      if (current_job_info) {
        const stats = current_job_info.stats ?? [];
        stats.push(statEntry);
        current_job_info = {
          ...current_job_info,
          stats: stats.slice(-100), // Keep last 100 entries
        };
        set_job_info(current_job_info);
      }
    });

    stream.on("done", (result: ExecOutput) => {
      if (result.type === "async") {
        set_job_info(result);
      }
      resolve(result);
    });

    stream.on("error", (err) => {
      reject(new Error(`Unable to run the compilation. ${err}`));
    });
  });
}
