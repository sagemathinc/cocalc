import {
  kernel as createKernel,
  JupyterKernel,
} from "@cocalc/project/jupyter/jupyter";
import { jupyter_execute_response } from "@cocalc/util/message";
import { run_cell } from "@cocalc/project/nbgrader/jupyter-run";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("jupyter:stateless-api:execute");

export default async function jupyterExecute(socket, mesg) {
  let kernel: undefined | Kernel = undefined;
  try {
    kernel = new Kernel(mesg.kernel);
    await kernel.init();

    if (mesg.history != null && mesg.history.length > 0) {
      // just execute this directly, since we will ignore the output
      // TODO: enforce a timeout
      await kernel.execute(mesg.history.join("\n"));
    }

    const outputs = await kernel.execute(mesg.input);
    socket.write_mesg(
      "json",
      jupyter_execute_response({ id: mesg.id, output: outputs })
    );
  } finally {
    if (kernel) {
      await kernel.close();
    }
  }
}

class Kernel {
  private kernel: JupyterKernel;
  private tempDir: string;

  constructor(private kernelName: string) {}

  async init() {
    this.tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
    const path = `${this.tempDir}/execute.ipynb`;
    this.kernel = await createKernel({ name: this.kernelName, path });
  }

  async execute(code: string) {
    const limits = {
      timeout_ms: 30000,
      timeout_ms_per_cell: 30000,
      max_output: 5000000,
      max_output_per_cell: 1000000,
      start_time: Date.now(),
      total_output: 0,
    } as const;

    const cell = { cell_type: "code", source: [code], outputs: [] };
    await run_cell(this.kernel, limits, cell);
    return cell.outputs;
  }

  async close() {
    try {
      await this.kernel.close();
    } catch (err) {
      log.warn("Error closing kernel", err);
    }
    try {
      await rm(this.tempDir, { force: true, recursive: true });
    } catch (err) {
      log.warn("Error cleaning up temporary directory", err);
    }
  }
}
