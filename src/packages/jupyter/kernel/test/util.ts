import { kernel, type JupyterKernel } from "../kernel";
import { getPythonKernelName } from "../kernel-data";

const usedNames = new Set<string>();
const kernels: JupyterKernel[] = [];
export async function getPythonKernel(
  path: string,
  noCheck = false,
): Promise<JupyterKernel> {
  if (!noCheck && usedNames.has(path)) {
    console.warn(
      "*".repeat(50) +
        "\n" +
        `do not reuse names as that is very confusing -- ${path}` +
        "\n" +
        "*".repeat(50),
    );
  }
  usedNames.add(path);
  const k = kernel({ name: await getPythonKernelName(), path });
  kernels.push(k);
  return k;
}

export function closeKernels() {
  kernels.map((k) => k.close());
}
