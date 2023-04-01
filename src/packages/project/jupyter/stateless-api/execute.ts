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
import { reuseInFlight } from "async-await-utils/hof";

const log = getLogger("jupyter:stateless-api:execute");

export default async function jupyterExecute(socket, mesg) {
  let kernel: undefined | Kernel = undefined;
  try {
    kernel = await Kernel.getFromPool(mesg.kernel);

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

const POOL_SIZE = 2;

export class Kernel {
  private static pools: { [kernelName: string]: Kernel[] } = {};

  private kernel: JupyterKernel;
  private tempDir: string;

  constructor(private kernelName: string) {
    this.init = reuseInFlight(this.init.bind(this));
  }

  private static getPool(kernelName: string) {
    let pool = Kernel.pools[kernelName];
    if (pool == null) {
      pool = Kernel.pools[kernelName] = [];
    }
    return pool;
  }

  static async getFromPool(kernelName: string): Promise<Kernel> {
    const pool = Kernel.getPool(kernelName);
    while (pool.length <= POOL_SIZE) {
      // <= since going to remove one below
      console.log("pool = ", pool);
      const k = new Kernel(kernelName);
      k.init(); // start init'ing, but do NOT block on it.
      pool.push(k);
    }
    const k = pool.shift() as Kernel;
    // it's ok to call again due to reuseInFlight and that no-op after init.
    console.log("grabbed k = ", k, "initing it");
    await k.init();
    console.log("done");
    return k;
  }

  private async init() {
    if (this.kernel != null) {
      // already initialized
      return;
    }
    this.tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
    const path = `${this.tempDir}/execute.ipynb`;
    this.kernel = createKernel({ name: this.kernelName, path });
    await this.kernel.ensure_running();
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

  async returnToPool(): Promise<void> {
    const pool = Kernel.getPool(this.kernelName);
    pool.push(this);
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
