/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { RunNotebookOptions } from "../smc-webapp/jupyter/nbgrader/api";
import { JupyterNotebook } from "../smc-webapp/jupyter/nbgrader/autograde";
import { is_object, len, uuid, trunc_middle } from "../smc-util/misc";
import { retry_until_success } from "../smc-util/async-utils";

import { kernel, JupyterKernel } from "../jupyter/jupyter";

// For tracking limits during the run:
interface Limits {
  timeout_ms_per_cell: number;
  max_output_per_cell: number;
  timeout_ms: number;
  max_output: number;
  start_time: number;
  total_output: number;
}

function global_timeout_exceeded(limits: Limits): boolean {
  return (
    limits.timeout_ms != 0 &&
    new Date().valueOf() - limits.start_time >= limits.timeout_ms
  );
}

export async function jupyter_run_notebook(
  client,
  logger,
  opts: RunNotebookOptions
): Promise<string> {
  const log = (...args) => {
    logger.debug("jupyter_run_notebook", ...args);
  };
  log(trunc_middle(JSON.stringify(opts)));
  const notebook: JupyterNotebook = JSON.parse(opts.ipynb);

  let limits: Limits = {
    timeout_ms: opts.limits?.max_total_time_ms ?? 0,
    timeout_ms_per_cell: opts.limits?.max_time_per_cell_ms ?? 0,
    max_output: opts.limits?.max_output ?? 0,
    max_output_per_cell: opts.limits?.max_output_per_cell ?? 0,
    start_time: new Date().valueOf(),
    total_output: 0,
  };

  const name = notebook.metadata.kernelspec.name;
  let jupyter: JupyterKernel | undefined = undefined;

  /* We use retry_until_success to spawn the kernel, since
     it makes people's lives much easier if this works even
     if there is a temporary issue.  Also, in testing, I've
     found that sometimes if you try to spawn two kernels at
     the exact same time as the same user things can fail
     This is possibly an upstream Jupyter bug, but let's
     just work around it since we want extra reliability
     anyways.
  */
  async function init_jupyter0(): Promise<void> {
    log("init_jupyter", jupyter != null);
    jupyter?.close();
    jupyter = undefined;
    // path is random so it doesn't randomly conflict with
    // something else running at the same time.
    const path = opts.path + `/${uuid()}.ipynb`;
    jupyter = kernel({ name, client, path });
    log("init_jupyter: spawning");
    // for Python, we suppress all warnings
    // they end up as stderr-output and hence would imply 0 points
    const env = { PYTHONWARNINGS: "ignore" };
    await jupyter.spawn({ env });
    log("init_jupyter: spawned");
  }

  async function init_jupyter(): Promise<void> {
    await retry_until_success({
      f: init_jupyter0,
      start_delay: 1000,
      max_delay: 5000,
      factor: 1.4,
      max_time: 30000,
      log: function (...args) {
        log("init_jupyter - retry_until_success", ...args);
      },
    });
  }

  try {
    log("init_jupyter...");
    await init_jupyter();
    log("init_jupyter: done");
    for (const cell of notebook.cells) {
      try {
        if (jupyter == null) {
          log("BUG: jupyter==null");
          throw Error("jupyter can't be null since it was initialized above");
        }
        log("run_cell...");
        await run_cell(jupyter, limits, cell); // mutates cell by putting in outputs
        log("run_cell: done");
      } catch (err) {
        // fatal error occured, e.g,. timeout, broken kernel, etc.
        if (cell.outputs == null) {
          cell.outputs = [];
        }
        cell.outputs.push({ traceback: [`${err}`] });
        if (!global_timeout_exceeded(limits)) {
          // close existing jupyter and spawn new one, so we can robustly run more cells.
          // Obviously, only do this if we are not out of time.
          log("timeout exceeded so restarting...");
          await init_jupyter();
          log("timeout exceeded restart done");
        }
      }
    }
  } finally {
    log("in finally");
    if (jupyter != null) {
      log("jupyter != null so closing");
      jupyter.close();
      jupyter = undefined;
    }
  }
  log("returning result");
  return JSON.stringify(notebook);
}

async function run_cell(
  jupyter: JupyterKernel,
  limits: Limits,
  cell
): Promise<void> {
  if (jupyter == null) {
    throw Error("jupyter must be defined");
  }

  if (global_timeout_exceeded(limits)) {
    // the total time has been exceeded -- this will mark outputs as error
    // for each cell in the rest of the notebook.
    throw Error(
      `Total time limit (=${Math.round(
        limits.timeout_ms / 1000
      )} seconds) exceeded`
    );
  }

  if (cell.cell_type != "code") {
    // skip all non-code cells -- nothing to run
    return;
  }
  const code = cell.source.join("");
  if (cell.outputs == null) {
    // shouldn't happen, since this would violate nbformat, but let's ensure
    // it anyways, just in case.
    cell.outputs = [];
  }

  const result = await jupyter.execute_code_now({
    code,
    timeout_ms: limits.timeout_ms_per_cell,
  });

  let cell_output_chars = 0;
  for (const x of result) {
    if (x == null) continue;
    if (x["msg_type"] == "clear_output") {
      cell.outputs = [];
    }
    const mesg: any = x["content"];
    if (mesg == null) continue;
    if (mesg.comm_id != null) {
      // ignore any comm/widget related messages
      continue;
    }
    delete mesg.execution_state;
    delete mesg.execution_count;
    delete mesg.payload;
    delete mesg.code;
    delete mesg.status;
    delete mesg.source;
    for (const k in mesg) {
      const v = mesg[k];
      if (is_object(v) && len(v) === 0) {
        delete mesg[k];
      }
    }
    if (len(mesg) == 0) continue;
    const n = JSON.stringify(mesg).length;
    limits.total_output += n;
    if (limits.max_output_per_cell) {
      cell_output_chars += n;
    }
    if (mesg["traceback"] != null) {
      // always include tracebacks
      cell.outputs.push(mesg);
    } else {
      if (
        limits.max_output_per_cell &&
        cell_output_chars > limits.max_output_per_cell
      ) {
        // Use stdout stream -- it's not an *error* that there is
        // truncated output; just something we want to mention.
        cell.outputs.push({
          name: "stdout",
          output_type: "stream",
          text: [
            `Output truncated since it exceeded the cell output limit of ${limits.max_output_per_cell} characters`,
          ],
        });
      } else if (limits.max_output && limits.total_output > limits.max_output) {
        cell.outputs.push({
          name: "stdout",
          output_type: "stream",
          text: [
            `Output truncated since it exceeded the global output limit of ${limits.max_output} characters`,
          ],
        });
      } else {
        cell.outputs.push(mesg);
      }
    }
  }
}
