import {
  kernel as createKernel,
  JupyterKernel,
} from "@cocalc/project/jupyter/jupyter";
import { run_cell, Limits } from "@cocalc/project/nbgrader/jupyter-run";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "async-await-utils/hof";

const log = getLogger("jupyter:stateless-api:kernel");

const DEFAULT_POOL_SIZE = 2;
const DEFAULT_POOL_TIMEOUT_S = 3600;

export default class Kernel {
  private static pools: { [kernelName: string]: Kernel[] } = {};
  private static last_active: { [kernelName: string]: number } = {};

  private kernel?: JupyterKernel;
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

  // Set a timeout for a given kernel pool (for a specifically named kernel)
  // to determine when to clear it if no requests have been made.
  private static setIdleTimeout(kernelName: string, timeout_s: number) {
    if (!timeout_s) {
      // 0 = no timeout
      return;
    }
    const now = Date.now();
    Kernel.last_active[kernelName] = now;
    setTimeout(() => {
      if (Kernel.last_active[kernelName] > now) {
        // kernel was requested after now.
        return;
      }
      // no request for kernelName, so we clear them from the pool
      for (const kernel of Kernel.pools[kernelName] ?? []) {
        kernel.close();
      }
      Kernel.pools[kernelName] = [];
    }, (timeout_s ?? DEFAULT_POOL_TIMEOUT_S) * 1000);
  }

  static async getFromPool(
    kernelName: string,
    {
      size = DEFAULT_POOL_SIZE,
      timeout_s = DEFAULT_POOL_TIMEOUT_S,
    }: { size?: number; timeout_s?: number } = {}
  ): Promise<Kernel> {
    this.setIdleTimeout(kernelName, timeout_s);
    const pool = Kernel.getPool(kernelName);
    while (pool.length <= size) {
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
    // TODO: make this configurable as part of the API call
    // I'm having a lot of trouble with this for now.
    //   -n = max open files
    //   -f = max bytes allowed to *write* to disk
    //   -t = max cputime is 30 seconds
    //   -v = max virtual memory usage to 3GB
    this.kernel = createKernel({
      name: this.kernelName,
      path,
      // ulimit: `-n 1000 -f 10485760 -t 30 -v 3000000`,
    });
    await this.kernel.ensure_running();
    await this.kernel.execute_code_now({ code: "" });
  }

  async execute(
    code: string,
    limits: Limits = {
      timeout_ms: 30000,
      timeout_ms_per_cell: 30000,
      max_output: 5000000,
      max_output_per_cell: 1000000,
      start_time: Date.now(),
      total_output: 0,
    }
  ) {
    if (this.kernel == null) {
      throw Error("kernel already closed");
    }

    if (limits.total_output == null) {
      limits.total_output = 0;
    }
    const cell = { cell_type: "code", source: [code], outputs: [] };
    await run_cell(this.kernel, limits, cell);
    return cell.outputs;
  }

  async chdir(path: string) {
    if (this.kernel == null) return;
    await this.kernel.chdir(path);
  }

  async returnToPool(): Promise<void> {
    if (this.kernel == null) {
      throw Error("kernel already closed");
    }
    const pool = Kernel.getPool(this.kernelName);
    pool.push(this);
  }

  async close() {
    if (this.kernel == null) return;
    try {
      await this.kernel.close();
    } catch (err) {
      log.warn("Error closing kernel", err);
    } finally {
      delete this.kernel;
    }
    try {
      await rm(this.tempDir, { force: true, recursive: true });
    } catch (err) {
      log.warn("Error cleaning up temporary directory", err);
    }
  }
}
