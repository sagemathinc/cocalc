/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { RunNotebookOptions } from "../smc-webapp/jupyter/nbgrader/api";
import { JupyterNotebook } from "../smc-webapp/jupyter/nbgrader/autograde";
import { is_object, len, uuid, trunc_middle } from "../smc-util/misc";

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
  logger.debug("jupyter_run_notebook", trunc_middle(JSON.stringify(opts)));
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

  async function init_jupyter(): Promise<void> {
    jupyter?.close();
    jupyter = undefined;
    // path is random so it doesn't randomly conflict with
    // something else running at the same time.
    const path = opts.path + `/${uuid()}.ipynb`;
    jupyter = kernel({ name, client, path });
    await jupyter.spawn();
  }

  try {
    await init_jupyter();
    for (const cell of notebook.cells) {
      try {
        if (jupyter == null) {
          throw Error("jupyter can't be null since it was initialized above");
        }
        await run_cell(jupyter, limits, !!opts.nbgrader, cell); // mutates cell by putting in outputs
      } catch (err) {
        // fatal error occured, e.g,. timeout, broken kernel, etc.
        if (cell.outputs == null) {
          cell.outputs = [];
        }
        cell.outputs.push({ traceback: [`${err}`] });
        if (!global_timeout_exceeded(limits)) {
          // close existing jupyter and spawn new one, so we can robustly run more cells.
          // Obviously, only do this if we are not out of time.
          await init_jupyter();
        }
      }
    }
  } finally {
    if (jupyter != null) {
      jupyter.close();
      jupyter = undefined;
    }
  }
  return JSON.stringify(notebook);
}

async function run_cell(
  jupyter: JupyterKernel,
  limits: Limits,
  nbgrader: boolean,
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

  if (nbgrader) {
    // Only process output for autograder cells.
    const is_autograde =
      cell.metadata?.nbgrader?.grade && !cell.metadata?.nbgrader?.solution;
    if (!is_autograde) {
      return;
    }
  }

  let cell_output_chars = 0;
  for (const x of result) {
    if (x == null || x["content"] == null || x["done"]) continue;
    if (x["msg_type"] == "clear_output") {
      cell.outputs = [];
      continue;
    }
    const mesg: any = x["content"];
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
