/*
This file defines all of the named servers we support.

To add another one, define a new entry in SPEC:

- The key is the name of the server.
- The value is a string this a function of (ip, port, basePath).  The string
  is a bash shell command that when run starts the server.  It might optionally
  use process.env so that the env can influence command line options.
*/

type CommandFunction = (ip: string, port: number, basePath: string) => string;

const SPEC: { [name: string]: CommandFunction } = {
  code: (ip: string, port: number) =>
    `code-server --bind-addr=${ip}:${port} --auth=none`,
  jupyter: (ip: string, port: number, basePath: string) =>
    `jupyter notebook --port-retries=0 --no-browser --NotebookApp.iopub_data_rate_limit=${
      process.env.COCALC_JUPYTER_NOTEBOOK_iopub_data_rate_limit ?? 2000000
    } --NotebookApp.iopub_msg_rate_limit=${
      process.env.COCALC_JUPYTER_NOTEBOOK_iopub_msg_rate_limit ?? 50
    } --NotebookApp.token='' --NotebookApp.password='' --NotebookApp.allow_remote_access=True --NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js --NotebookApp.base_url=${basePath} --ip=${ip} --port=${port}`,
  jupyterlab: (ip: string, port: number, basePath: string) =>
    `jupyter lab --port-retries=0 --no-browser --NotebookApp.iopub_data_rate_limit=${
      process.env.COCALC_JUPYTER_LAB_iopub_data_rate_limit ?? 2000000
    } --NotebookApp.iopub_msg_rate_limit=${
      process.env.COCALC_JUPYTER_LAB_iopub_msg_rate_limit ?? 50
    } --NotebookApp.token='' --NotebookApp.password='' --NotebookApp.allow_remote_access=True --NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js --NotebookApp.base_url=${basePath} --ip=${ip} --port=${port}`,
  pluto: (ip: string, port: number) =>
    `echo 'import Pluto; Pluto.run(launch_browser=false, require_secret_for_access=false, host="${ip}", port=${port})' | julia`,
} as const;

export default function getSpec(name: string): CommandFunction {
  const spec = SPEC[name];
  if (spec == null) {
    throw Error(`unknown named server: "${name}"`);
  }
  return spec;
}
