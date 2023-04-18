/*
Launching and managing Jupyter kernels in a pool for
performance.
*/

import json from "json-stable-stringify";
import { reuseInFlight } from "async-await-utils/hof";
import launchJupyterKernelNoPool, {
  LaunchJupyterOpts,
  SpawnedKernel,
} from "./launch-jupyter-kernel";
import { exists, unlink } from "./async-utils-node";
import { unlinkSync } from "fs";
import { getLogger } from "@cocalc/project/logger";
import { getLanguage } from "./kernel-data";
import { getAbsolutePathFromHome } from "./util";
import createChdirCommand from "@cocalc/util/jupyter-api/chdir-commands";
import createSetenvCommand from "@cocalc/util/jupyter-api/setenv-commands";
import nodeCleanup from "node-cleanup";
import { delay } from "awaiting";
import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";

export type { LaunchJupyterOpts, SpawnedKernel };

const log = getLogger("jupyter:pool");

const DEFAULT_POOL_SIZE = 1;
const DEFAULT_POOL_TIMEOUT_S = 3600;
const DEFAULT_DELAY_MS = 7500;

const CONFIG = join(homedir(), ".config", "cocalc-jupyter-pool");

async function writeConfig(content: string): Promise<void> {
  try {
    await writeFile(CONFIG, content);
  } catch (error) {
    log.debug("Error writeConfig -- ", error);
  }
}

async function readConfig(): Promise<string> {
  try {
    return (await readFile(CONFIG)).toString();
  } catch (error) {
    return "";
  }
}

const POOL: { [key: string]: SpawnedKernel[] } = {};
const EXPIRE: { [key: string]: number } = {};

// Make key for cache that describes this kernel.  We explicitly omit
// the parameters that aren't generic and would make it not possible to
// put this in a pool:
//   - opts.cwd : current working directory
function makeKey({ name, opts }) {
  // Copy of opts but delete opts.cwd and opts.env.COCALC_JUPYTER_FILENAME.
  // We don't change opts though!
  const opts0 = { ...opts };
  delete opts0.cwd;
  opts0.env = { ...opts.env };
  delete opts0.env.COCALC_JUPYTER_FILENAME;
  return json({ name, opts: opts0 });
}

export default async function launchJupyterKernel(
  name: string, // name of the kernel
  opts: LaunchJupyterOpts,
  size: number = DEFAULT_POOL_SIZE, // min number of these in the pool
  timeout_s: number = DEFAULT_POOL_TIMEOUT_S
): Promise<SpawnedKernel> {
  let language;
  try {
    language = await getLanguage(name);
  } catch (error) {
    log.error("Failed to get language of kernel -- not using pool", error);
    return await launchJupyterKernelNoPool(name, opts);
  }

  let initCode: string[] = [];
  if (opts.cwd) {
    try {
      const absPath = getAbsolutePathFromHome(opts.cwd);
      initCode.push(createChdirCommand(language, absPath));
    } catch (error) {
      log.error("Failed to get chdir command -- not using pool", error);
      return await launchJupyterKernelNoPool(name, opts);
    }
  }
  if (opts.env?.COCALC_JUPYTER_FILENAME) {
    try {
      initCode.push(
        createSetenvCommand(
          language,
          "COCALC_JUPYTER_FILENAME",
          opts.env.COCALC_JUPYTER_FILENAME
        )
      );
    } catch (error) {
      log.error("Failed to get setenv command -- not using pool", error);
      return await launchJupyterKernelNoPool(name, opts);
    }
  }

  const key = makeKey({ name, opts });
  log.debug("launchJupyterKernel", key);
  try {
    if (POOL[key] == null) {
      POOL[key] = [];
    }
    if (POOL[key].length > 0) {
      const kernel = POOL[key].shift();
      replenishPool(key, size, timeout_s);
      return { ...(kernel as SpawnedKernel), initCode };
    }
    const kernel = await launchJupyterKernelNoPool(name, opts);

    // we don't start replenishing the pool until the kernel is initialized,
    // since we don't want to slow down creating the kernel itself!
    replenishPool(key, size, timeout_s);

    // we do NOT include the initCode here; it's not needed since this kernel
    // isn't from the pool.
    return kernel;
  } catch (error) {
    log.error("Failed to launch Jupyter kernel", error);
    throw error;
  }
}

// Don't replenish pool for same key twice at same time, or
// pool could end up a little too big.
const replenishPool = reuseInFlight(
  async (key, size = DEFAULT_POOL_SIZE, timeout_s = DEFAULT_POOL_TIMEOUT_S) => {
    log.debug("replenishPool", key, { size, timeout_s });
    try {
      if (POOL[key] == null) {
        POOL[key] = [];
      }
      const pool = POOL[key];
      while (pool.length < size) {
        log.debug("replenishPool - creating a kernel", key);
        writeConfig(key);
        const { name, opts } = JSON.parse(key);
        await delay(DEFAULT_DELAY_MS);
        const kernel = await launchJupyterKernelNoPool(name, opts);
        pool.push(kernel);
        EXPIRE[key] = Math.max(EXPIRE[key] ?? 0, Date.now() + 1000 * timeout_s);
      }
    } catch (error) {
      log.error("Failed to replenish Jupyter kernel pool", error);
      throw error;
    }
  },
  {
    createKey: (args) => args[0],
  }
);

/*
If there is nothing in the pool, find the newest non-hidden ipynb files in
the current directory or in any immediate subdirectory.  It is a JSON file,
and we parse the

*/
async function fillWhenEmpty() {
  for (const key in POOL) {
    if (POOL[key].length > 0) {
      // nothing to do
      return;
    }
  }
  // pool is empty, so possibly put something in it.
  const key = await readConfig();
  if (key) {
    replenishPool(key);
  }
}

async function maintainPool() {
  log.debug("maintainPool", { EXPIRE });
  const now = Date.now();
  for (const key in EXPIRE) {
    if (EXPIRE[key] < now) {
      log.debug("maintainPool -- expiring key=", key);
      const pool = POOL[key] ?? [];
      while (pool.length > 0) {
        const kernel = pool.shift() as SpawnedKernel;
        try {
          await killKernel(kernel);
        } catch (error) {
          // won't happen
          log.error("Failed to kill Jupyter kernel", error);
        }
      }
    }
  }
  fillWhenEmpty();
}

// DO NOT create the pool if we're running under jest testing, since
// then tests don't exit cleanly.
if (process.env.NODE_ENV != "test") {
  setInterval(maintainPool, 30 * 1000);
  maintainPool();
}

nodeCleanup(() => {
  for (const key in POOL) {
    for (const kernel of POOL[key]) {
      try {
        process.kill(-kernel.spawn.pid, "SIGTERM");
        unlinkSync(kernel.connectionFile);
      } catch (_) {}
    }
  }
});

export async function killKernel(kernel: SpawnedKernel) {
  kernel.spawn?.removeAllListeners();
  try {
    if (kernel.spawn?.pid) {
      log.debug("killKernel pid=", kernel.spawn.pid);
      try {
        process.kill(-kernel.spawn.pid, "SIGTERM");
      } catch (error) {
        log.error("Failed to send SIGTERM to Jupyter kernel", error);
      }
    }
    kernel.spawn?.close?.();
    if (await exists(kernel.connectionFile)) {
      try {
        await unlink(kernel.connectionFile);
      } catch (error) {
        log.error(
          `Failed to delete Jupyter kernel connection file ${kernel.connectionFile}`,
          error
        );
      }
    }
  } catch (error) {
    log.error("Failed to kill Jupyter kernel", error);
  }
}
