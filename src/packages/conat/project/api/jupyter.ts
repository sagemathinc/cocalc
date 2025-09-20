import type { NbconvertParams } from "@cocalc/util/jupyter/types";
import type { RunNotebookOptions } from "@cocalc/util/jupyter/nbgrader-types";
import type { KernelSpec } from "@cocalc/util/jupyter/types";
import { type ProjectJupyterApiOptions } from "@cocalc/util/jupyter/api-types";

export const jupyter = {
  start: true,
  stop: true,
  stripNotebook: true,
  nbconvert: true,
  runNotebook: true,
  kernelLogo: true,
  kernels: true,
  introspect: true,
  complete: true,
  signal: true,
  getConnectionFile: true,

  sendCommMessageToKernel: true,
  ipywidgetsGetBuffer: true,

  // jupyter stateless API
  apiExecute: true,
};

// In the functions below path can be either the .ipynb or the .sage-jupyter2 path, and
// the correct backend kernel will get found/created automatically.
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

  introspect: (opts: {
    path: string;
    code: string;
    cursor_pos: number;
    detail_level: 0 | 1;
  }) => Promise<any>;

  complete: (opts: {
    path: string;
    code: string;
    cursor_pos: number;
  }) => Promise<any>;

  getConnectionFile: (opts: { path: string }) => Promise<string>;

  signal: (opts: { path: string; signal: string }) => Promise<void>;

  apiExecute: (opts: ProjectJupyterApiOptions) => Promise<object[]>;

  sendCommMessageToKernel: (opts: {
    path: string;
    msg: {
      msg_id: string;
      comm_id: string;
      target_name: string;
      data: any;
      buffers64?: string[];
      buffers?: Buffer[];
    };
  }) => Promise<void>;

  ipywidgetsGetBuffer: (opts: {
    path: string;
    model_id: string;
    buffer_path: string | string[];
  }) => Promise<{ buffer64: string }>;
}
