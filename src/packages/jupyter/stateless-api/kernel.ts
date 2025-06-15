import { kernel as createKernel } from "@cocalc/jupyter/kernel";
import type { JupyterKernelInterface } from "@cocalc/jupyter/types/project-interface";
import { run_cell, Limits } from "@cocalc/jupyter/nbgrader/jupyter-run";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const log = getLogger("jupyter:stateless-api:kernel");

export const DEFAULT_POOL_SIZE = 2;
const DEFAULT_POOL_TIMEOUT_S = 3600;

// When we idle timeout we always keep at least this many kernels around.  We don't go to 0.
const MIN_POOL_SIZE = 1;

export default class Kernel {
  private static pools: { [kernelName: string]: Kernel[] } = {};
  private static last_active: { [kernelName: string]: number } = {};

  private kernel?: JupyterKernelInterface;
  private tempDir: string;

  constructor(private kernelName: string) {}

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
    setTimeout(
      () => {
        if (Kernel.last_active[kernelName] > now) {
          // kernel was requested after now.
          return;
        }
        // No recent request for kernelName.
        // Keep at least MIN_POOL_SIZE in Kernel.pools[kernelName]. I.e.,
        // instead of closing and deleting everything, we just want to
        // shrink the pool to MIN_POOL_SIZE.
        // no request for kernelName, so we clear them from the pool
        const poolToShrink = Kernel.pools[kernelName] ?? [];
        if (poolToShrink.length > MIN_POOL_SIZE) {
          // check if pool needs shrinking
          // calculate how many to close
          const numToClose = poolToShrink.length - MIN_POOL_SIZE;
          for (let i = 0; i < numToClose; i++) {
            poolToShrink[i].close(); // close oldest kernels first
          }
          // update pool to have only the most recent kernels
          Kernel.pools[kernelName] = poolToShrink.slice(numToClose);
        }
      },
      (timeout_s ?? DEFAULT_POOL_TIMEOUT_S) * 1000,
    );
  }

  static async getFromPool(
    kernelName: string,
    {
      size = DEFAULT_POOL_SIZE,
      timeout_s = DEFAULT_POOL_TIMEOUT_S,
    }: { size?: number; timeout_s?: number } = {},
  ): Promise<Kernel> {
    this.setIdleTimeout(kernelName, timeout_s);
    const pool = Kernel.getPool(kernelName);
    let i = 1;
    while (pool.length <= size) {
      // <= since going to remove one below
      const k = new Kernel(kernelName);
      // we cause this kernel to get init'd soon, but NOT immediately, since starting
      // several at once just makes them all take much longer exactly when the user
      // most wants to use their new kernel
      setTimeout(async () => {
        try {
          await k.init();
        } catch (err) {
          log.debug("Failed to pre-init Jupyter kernel -- ", kernelName, err);
        }
      }, 3000 * i); // stagger startup by a few seconds, though kernels that are needed will start ASAP.
      i += 1;
      pool.push(k);
    }
    const k = pool.shift() as Kernel;
    // it's ok to call again due to reuseInFlight and that no-op after init.
    await k.init();
    return k;
  }

  private init = reuseInFlight(async () => {
    if (this.kernel != null) {
      // already initialized
      return;
    }
    this.tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
    const path = `${this.tempDir}/execute.ipynb`;
    // TODO: make this configurable as part of the API call
    //   -n = max open files
    //   -f = max bytes allowed to *write* to disk
    //   -t = max cputime is 30 seconds
    //   -v = max virtual memory usage to 3GB
    this.kernel = createKernel({
      name: this.kernelName,
      path,
      ulimit: `-n 1000 -f 10485760 -t 30 -v 3000000`,
    });
    await this.kernel.ensure_running();
    await this.kernel.execute_code_now({ code: "" });
  });

  // empty all pools and do not refill
  static closeAll() {
    for (const kernelName in Kernel.pools) {
      for (const kernel of Kernel.pools[kernelName]) {
        kernel.close();
      }
    }
    Kernel.pools = {};
    Kernel.last_active = {};
  }

  execute = async (
    code: string,
    limits: Limits = {
      timeout_ms: 30000,
      timeout_ms_per_cell: 30000,
      max_output: 5000000,
      max_output_per_cell: 1000000,
      start_time: Date.now(),
      total_output: 0,
    },
  ) => {
    if (this.kernel == null) {
      throw Error("kernel already closed");
    }

    if (limits.total_output == null) {
      limits.total_output = 0;
    }
    const cell = { cell_type: "code", source: [code], outputs: [] };
    await run_cell(this.kernel, limits, cell);
    return cell.outputs;
  };

  chdir = async (path: string) => {
    if (this.kernel == null) return;
    await this.kernel.chdir(path);
  };

  // this is not used anywhere
  returnToPool = async (): Promise<void> => {
    if (this.kernel == null) {
      throw Error("kernel already closed");
    }
    const pool = Kernel.getPool(this.kernelName);
    pool.push(this);
  };

  close = async () => {
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
  };
}
