import {
  kernel as createKernel,
  JupyterKernel,
} from "@cocalc/project/jupyter/jupyter";
import { run_cell } from "@cocalc/project/nbgrader/jupyter-run";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "async-await-utils/hof";

const log = getLogger("jupyter:stateless-api:kernel");

const POOL_SIZE = 2;

export default class Kernel {
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
      const k = new Kernel(kernelName);
      k.init(); // start init'ing, but do NOT block on it.
      pool.push(k);
    }
    const k = pool.shift() as Kernel;
    // it's ok to call again due to reuseInFlight and that no-op after init.
    await k.init();
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

