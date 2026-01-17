import { kernel as createKernel } from "@cocalc/jupyter/kernel";
import type { JupyterKernelInterface } from "@cocalc/jupyter/types/project-interface";
import { run_cell } from "@cocalc/jupyter/nbgrader/jupyter-run";
import { mkdtemp } from "fs/promises";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type Limits } from "@cocalc/util/jupyter/nbgrader-types";
import { closeAll as closeAllLaunches } from "@cocalc/jupyter/kernel/launch-kernel";

const log = getLogger("jupyter:stateless-api:kernel");

//   -n = max open files
//   -f = max bytes allowed to *write* to disk
//   -t = max cputime is 30 seconds
//   -v = max virtual memory usage to 3GB
const DEFAULT_ULIMIT = "-n 1000 -f 10485760 -t 30 -v 3000000";

export default class Kernel {
  private static ulimit: { [kernelName: string]: string } = {};

  private kernel?: JupyterKernelInterface;
  private tempDir?: string;
  private state?: "closed" | undefined = undefined;

  constructor(private kernelName: string) {
    kernels.push(this);
  }

  // changing ulimit only impacts NEWLY **created** kernels.
  static setUlimit(kernelName: string, ulimit: string) {
    Kernel.ulimit[kernelName] = ulimit;
  }

  static async create(kernelName: string): Promise<Kernel> {
    const kernel = new Kernel(kernelName);
    await kernel.init();
    return kernel;
  }

  private init = reuseInFlight(async () => {
    if (this.kernel != null || this.state == "closed") {
      // already initialized
      return;
    }
    this.tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
    if (this.state == "closed") {
      this.close();
      return;
    }
    const path = `${this.tempDir}/execute.ipynb`;
    this.kernel = createKernel({
      name: this.kernelName,
      path,
      ulimit: Kernel.ulimit[this.kernelName] ?? DEFAULT_ULIMIT,
    });
    await this.kernel.ensureRunning();
    if (this.state == "closed") {
      this.close();
      return;
    }
    await this.kernel.execute_code_now({ code: "" });
    if (this.state == "closed") {
      this.close();
      return;
    }
  });

  static closeAll() {
    closeAllKernels();
  }

  execute = async (
    code: string,
    limits: Partial<Limits> = {
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

  close = () => {
    this.state = "closed";
    try {
      this.kernel?.close();
    } catch (err) {
      log.warn("Error closing kernel", err);
    } finally {
      delete this.kernel;
    }
    if (this.tempDir) {
      try {
        rmSync(this.tempDir, { force: true, recursive: true });
      } catch (err) {
        log.warn("Error cleaning up temporary directory", err);
      } finally {
        delete this.tempDir;
      }
    }
  };
}

// Clean up after any kernel created here
const kernels: Kernel[] = [];
function closeAllKernels() {
  closeAllLaunches();
  for (const kernel of kernels) {
    kernel.close();
  }
  kernels.length = 0;
}

process.once("exit", () => {
  closeAllKernels();
});

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    closeAllKernels();
  });
});
