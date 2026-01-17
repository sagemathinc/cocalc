/*
Kernel spec discovery without `jupyter-paths` or `kernelspecs`.

Search order (mirrors the data dirs used by `jupyter kernelspec list`):
1) JUPYTER_PATH (path-delimited list)
2) JUPYTER_DATA_DIR or the platform default user data dir:
   - Linux: ~/.local/share/jupyter
   - macOS: ~/Library/Jupyter
   - Windows: %APPDATA%\\jupyter
3) sys-prefix/share/jupyter, where sys-prefix is:
   - CONDA_PREFIX or VIRTUAL_ENV when set
   - otherwise the prefix of the first python/python3 on PATH
4) system dirs:
   - Linux: /usr/local/share/jupyter, /usr/share/jupyter
   - Windows: %PROGRAMDATA%\\jupyter (if set)

We do not shell out to `jupyter --paths`, so results can differ if PATH/ENV
do not match the environment that `jupyter` would use.
*/

import { accessSync, constants } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type KernelResources = {
  name: string;
  files: string[];
  resource_dir: string;
  spec: any;
};

let cachedSysPrefix: string | null | undefined;

function splitEnvPaths(value?: string): string[] {
  if (!value) return [];
  return value.split(path.delimiter).filter((entry) => entry.trim() !== "");
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function guessSysPrefix(): string | null {
  if (cachedSysPrefix !== undefined) {
    return cachedSysPrefix;
  }

  const envPrefix = process.env.CONDA_PREFIX ?? process.env.VIRTUAL_ENV;
  if (envPrefix) {
    cachedSysPrefix = envPrefix;
    return cachedSysPrefix;
  }

  const searchPath = splitEnvPaths(process.env.PATH);
  if (searchPath.length === 0) {
    cachedSysPrefix = null;
    return cachedSysPrefix;
  }

  const pythonNames =
    process.platform === "win32" ? ["python"] : ["python3", "python"];
  const pathext =
    process.platform === "win32" ? splitEnvPaths(process.env.PATHEXT) : [""];
  if (pathext.length === 0) {
    pathext.push("");
  }

  for (const bin of searchPath) {
    const resolvedBin = path.resolve(bin);
    for (const pythonName of pythonNames) {
      const base = path.join(resolvedBin, pythonName);
      for (const ext of pathext) {
        const exe = base + ext;
        if (isExecutable(exe)) {
          cachedSysPrefix =
            process.platform === "win32"
              ? path.dirname(path.resolve(exe))
              : path.dirname(path.dirname(path.resolve(exe)));
          return cachedSysPrefix;
        }
      }
    }
  }

  cachedSysPrefix = null;
  return cachedSysPrefix;
}

function userDataDir(): string {
  if (process.env.JUPYTER_DATA_DIR) {
    return process.env.JUPYTER_DATA_DIR;
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Jupyter");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? homedir();
    return path.resolve(path.join(appData, "jupyter"));
  }
  return path.join(homedir(), ".local", "share", "jupyter");
}

function systemDataDirs(): string[] {
  if (process.platform === "win32") {
    if (!process.env.PROGRAMDATA) {
      return [];
    }
    return [path.resolve(path.join(process.env.PROGRAMDATA, "jupyter"))];
  }
  return ["/usr/local/share/jupyter", "/usr/share/jupyter"];
}

function getJupyterDataDirs(): string[] {
  const dirs: string[] = [];
  dirs.push(...splitEnvPaths(process.env.JUPYTER_PATH));
  dirs.push(userDataDir());
  const sysPrefix = guessSysPrefix();
  if (sysPrefix) {
    dirs.push(path.join(sysPrefix, "share", "jupyter"));
  }
  dirs.push(...systemDataDirs());

  const seen = new Set<string>();
  return dirs.filter((dir) => {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) {
      return false;
    }
    seen.add(resolved);
    return true;
  });
}

async function getKernelResources(
  kernelInfo: { name: string; resourceDir: string },
): Promise<KernelResources | undefined> {
  try {
    const files = await readdir(kernelInfo.resourceDir);
    if (!files.includes("kernel.json")) {
      return undefined;
    }
    const data = await readFile(
      path.join(kernelInfo.resourceDir, "kernel.json"),
    );
    return {
      name: kernelInfo.name,
      files: files.map((entry) => path.join(kernelInfo.resourceDir, entry)),
      resource_dir: kernelInfo.resourceDir,
      spec: JSON.parse(data.toString()),
    };
  } catch {
    return undefined;
  }
}

async function getKernelInfos(directory: string) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        resourceDir: path.join(directory, entry.name),
      }));
  } catch {
    return [];
  }
}

export async function findAllKernelSpecs(): Promise<
  Record<string, KernelResources>
> {
  const dataDirs = getJupyterDataDirs();
  const kernelDirs = dataDirs.map((dir) => path.join(dir, "kernels"));
  const kernelInfos = (
    await Promise.all(kernelDirs.map((dir) => getKernelInfos(dir)))
  ).flat();

  const kernelResources = await Promise.all(
    kernelInfos.map((info) => getKernelResources(info)),
  );

  return kernelResources.reduce<Record<string, KernelResources>>(
    (kernels, kernel) => {
      if (kernel && !kernels[kernel.name]) {
        kernels[kernel.name] = kernel;
      }
      return kernels;
    },
    {},
  );
}

export async function findKernelSpec(
  name: string,
): Promise<KernelResources> {
  const specs = await findAllKernelSpecs();
  const spec = specs[name];
  if (!spec) {
    throw new Error(
      `No spec available for kernel "${name}".  Available specs: ${JSON.stringify(
        Object.keys(specs),
      )}`,
    );
  }
  return spec;
}
