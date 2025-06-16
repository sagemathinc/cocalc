export interface ProjectJupyterApiOptions {
  hash?: string; // give either hash *or* kernel, input, history, etc.
  kernel: string; // jupyter kernel
  input: string; // input code to execute
  history?: string[]; // optional history of this conversation as a list of input strings.  Do not include output.
  path?: string; // optional path where execution happens
  pool?: { size?: number; timeout_s?: number };
  limits?: Partial<{
    // see packages/jupyter/nbgrader/jupyter-run.ts
    timeout_ms_per_cell: number;
    max_output_per_cell: number;
    max_output: number;
    total_output: number;
    timeout_ms?: number;
    start_time?: number;
  }>;
}

export interface JupyterApiOptions extends ProjectJupyterApiOptions {
  project_id: string;
}
