import { jupyter_execute_response } from "@cocalc/util/message";
import {
  kernel as createKernel,
  JupyterKernel,
} from "@cocalc/project/jupyter/jupyter";
import { run_cell } from "@cocalc/project/nbgrader/jupyter-run";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("jupyter:stateless-api:execute");

export default async function jupyterExecute(socket, mesg) {
  let kernel: undefined | JupyterKernel = undefined;
  let tempDir = "";
  try {
    tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
    const tempPath = `${tempDir}/execute.ipynb`;
    kernel = createKernel({
      name: mesg.kernel,
      path: tempPath,
    });

    if (mesg.history != null && mesg.history.length > 0) {
      // just execute this directly, since we will ignore the output
      // TODO: enforce a timeout
      await kernel.execute_code_now({ code: mesg.history.join("\n") });
    }

    let limits = {
      // TODO: limits
      timeout_ms: 0,
      timeout_ms_per_cell: 0,
      max_output: 0,
      max_output_per_cell: 0,
      start_time: Date.now(),
      total_output: 0,
    } as const;

    const cell = { cell_type: "code", source: [mesg.input], outputs: [] };
    await run_cell(kernel, limits, cell);
    socket.write_mesg(
      "json",
      jupyter_execute_response({ id: mesg.id, output: cell.outputs })
    );
  } finally {
    // Delete all files from temporary directory and delete the directory itself
    if (kernel) {
      try {
        await kernel.close();
      } catch (err) {
        log.warn("Error closing kernel", err);
      }
    }
    if (tempDir) {
      try {
        await rm(tempDir, { force: true, recursive: true });
      } catch (err) {
        log.warn("Error cleaning up temporary directory", err);
      }
    }
  }
}
