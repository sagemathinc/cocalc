/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Convert R Markdown file to hidden Markdown file, then read.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { path_split } from "@cocalc/util/misc";
import { ExecOutput } from "../generic/client";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { ExecOptsBlocking } from "@cocalc/util/db-schema/projects";
import { webapp_client } from "@cocalc/frontend/webapp-client";

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

async function runJob(opts: RunJobOpts): Promise<ExecOutput> {
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
    timeout: 4 * 60, // 4 minutes timeout for RMD conversion
    // Pass debug info for backend logging
    debug: `RMD conversion for: ${path}`,
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

    stream.on("error", () => {
      reject(
        new Error(
          "Unable to run the RMD conversion. Please check up on the project.",
        ),
      );
    });
  });
}

export const convert = reuseInFlight(_convert);

async function _convert(
  project_id: string,
  path: string,
  frontmatter: string,
  hash,
  set_job_info?: (info: ExecuteCodeOutputAsync) => void,
): Promise<ExecOutput> {
  const x = path_split(path);
  const infile = x.tail;
  // console.log("frontmatter", frontmatter);
  let cmd: string;
  // https://www.rdocumentation.org/packages/rmarkdown/versions/1.10/topics/render
  // unless user specifies some self_contained value or user did set an explicit "output: ..." mode,
  // we disable it as a convenience (rough heuristic, but should be fine)
  if (
    frontmatter.indexOf("self_contained") >= 0 ||
    frontmatter.indexOf("output:") >= 0
  ) {
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE)`;
  } else {
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE, output_options = list(self_contained = FALSE))`;
  }

  return await runJob({
    aggregate: hash ? { value: hash } : undefined,
    command: "Rscript",
    args: ["-e", cmd],
    env: { MPLBACKEND: "Agg" }, // for python plots -- https://github.com/sagemathinc/cocalc/issues/4202
    project_id: project_id,
    runDir: x.head,
    set_job_info: set_job_info || (() => {}),
    timeout: 4 * 60,
    path: path,
  });
}
