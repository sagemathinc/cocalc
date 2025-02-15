/*
Services in a project.
*/

import { createServiceClient, createServiceHandler } from "./typed";

const service = "api";

interface JupyterApi {
  signal: any;
  save_ipynb_file: any;
  kernel_info: any;
  more_output: any;
  complete: any;
  introspect: any;
  store: any;
  comm: any;
  "ipywidgets-get-buffer": any;
  kernels: any;
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
