import { RunNotebookOptions } from "../smc-webapp/jupyter/nbgrader/api";
import { JupyterNotebook } from "../smc-webapp/jupyter/nbgrader/autograde";
import { is_object, len, uuid } from "../smc-util/misc";

import { kernel } from "../jupyter/jupyter";

export async function jupyter_run_notebook(
  client,
  logger,
  opts: RunNotebookOptions
): Promise<string> {
  logger.debug("jupyter_run_notebook", opts);
  const notebook: JupyterNotebook = JSON.parse(opts.ipynb);
  const name = notebook.metadata.kernelspec.name;
  const jupyter = kernel({
    name,
    client,
    path: opts.path + `/${uuid()}.ipynb`  // critical that this doesn't randomly conflict with something else running at the same time.
  });
  try {
    await jupyter.spawn();

    for (const cell of notebook.cells) {
      if (cell.cell_type != "code") continue;
      const code = cell.source.join("");
      if (cell.outputs == null) {
        // shouldn't happen, since this would violate nbformat, but let's ensure
        // it anyways, just in case.
        cell.outputs = [];
      }
      // TODO: limits on time and size; also should we worry about combining
      // adjacent messages.
      const result = await jupyter.execute_code_now({ code });
      if (opts.nbgrader) {
        // Only process output for autograder cells.
        const is_autograde =
          cell.metadata != null &&
          cell.metadata.nbgrader != null &&
          cell.metadata.nbgrader.grade &&
          !cell.metadata.nbgrader.solution;
        if (!is_autograde) {
          continue;
        }
      }
      for (const x of result) {
        if (x == null || x["content"] == null || x["done"]) continue;
        if (x["msg_type"] == "clear_output") {
          cell.outputs = [];
          continue;
        }
        const mesg: any = (x as any).content;
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
        cell.outputs.push(mesg);
      }
    }
  } finally {
    jupyter.close();
  }
  return JSON.stringify(notebook);
}
