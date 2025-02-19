/*
Services in a project.
*/

import { createServiceClient, createServiceHandler } from "./typed";
import type { KernelInfo, KernelSpec } from "@cocalc/util/jupyter/types";

const service = "api";

interface JupyterApi {
  signal: (signal: string) => Promise<void>;
  save_ipynb_file: () => Promise<void>;
  kernel_info: () => Promise<KernelInfo>;
  more_output: (id: string) => Promise<any[]>;
  complete: (opts: { code: string; cursor_pos: number }) => Promise<any>;
  introspect: (opts: { code: string; cursor_pos: number }) => Promise<any>;
  store: (opts: { key: string; value?: any }) => Promise<any>;
  comm: (opts: {
    msg_id: string;
    comm_id: string;
    target_name: string;
    data: any;
    buffers64?: string[];
    buffers?: Buffer[];
  }) => Promise<void>;
  "ipywidgets-get-buffer": (opts: {
    model_id;
    buffer_path;
  }) => Promise<{ buffer64: string }>;
  kernels: () => Promise<KernelSpec[]>;
}

export type JupyterApiEndpoint = keyof JupyterApi;

export function jupyterApiClient({
  project_id,
  path,
  timeout,
}: {
  project_id: string;
  path: string;
  timeout?: number;
}) {
  return createServiceClient<JupyterApi>({
    project_id,
    path,
    service,
    timeout,
  });
}

export async function createNatsJupyterService({
  path,
  project_id,
  impl,
}: {
  project_id: string;
  path: string;
  impl: JupyterApi;
}) {
  return await createServiceHandler<JupyterApi>({
    project_id,
    path,
    service,
    impl,
    description: "Jupyter notebook compute API",
  });
}
