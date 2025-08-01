import type { NbconvertParams } from "@cocalc/util/jupyter/types";
import type { RunNotebookOptions } from "@cocalc/util/jupyter/nbgrader-types";
import type { KernelSpec } from "@cocalc/util/jupyter/types";

export const jupyter = {
  start: true,
  stop: true,
  stripNotebook: true,
  nbconvert: true,
  runNotebook: true,
  kernelLogo: true,
  kernels: true,
};

export interface Jupyter {
  stripNotebook: (path_ipynb: string) => Promise<string>;

  // path = the syncdb path (not *.ipynb)
  start: (path: string) => Promise<void>;
  stop: (path: string) => Promise<void>;

  nbconvert: (opts: NbconvertParams) => Promise<void>;

  runNotebook: (opts: RunNotebookOptions) => Promise<string>;

  kernelLogo: (
    kernelName: string,
    opts?: { noCache?: boolean },
  ) => Promise<{ filename: string; base64: string }>;

  kernels: (opts?: { noCache?: boolean }) => Promise<KernelSpec[]>;
}
