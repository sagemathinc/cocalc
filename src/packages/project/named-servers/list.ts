/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This file defines all of the named servers we support.

To add another one, define a new entry in SPEC:

- The key is the name of the server.
- The value is a string this a function of (ip, port, basePath).  The string
  is a bash shell command that when run starts the server.  It might optionally
  use process.env so that the env can influence command line options.
*/

import { NamedServerName } from "@cocalc/util/types/servers";

type CommandFunction = (ip: string, port: number, basePath: string) => string;

// Disables JupyterLab RTC since it is still very buggy, unfortunately.
/*
Reported:
1. The steps I’ve taken:
* Start a JupyterLabs Notebook server from my project settings
* In the server, open & edit a Jupyter Notebook w/ Python 3 system-wide kernel
* (Optional) Shutdown project/close browser tab
* Walk away, return 30+ minutes later
* (Optional) Restart project/server
* Edit already open notebook, try to save/export/download

2. What happened:
Editing the notebook behaves as usual (code runs), I can access the file system, interact with a terminal, but any changes I make to this already-open notebook won’t save.

I also saw almost exactly this happen in the JupyterLab weekly meeting
with the latest beta in early November (that was even worse, since refreshing
maybe didn't even work).
*/

// If you want to enable it, set the environment variable in Project Settings {"COCALC_JUPYTERLAB_RTC": "true"}
const JUPYTERLAB_RTC = process.env.COCALC_JUPYTERLAB_RTC === "true";

// iopub params for jupyter notebook
const JUPYTERNB_DATA =
  process.env.COCALC_JUPYTER_NOTEBOOK_iopub_data_rate_limit ?? 2000000;
const JUPYTERNB_MSGS =
  process.env.COCALC_JUPYTER_NOTEBOOK_iopub_msg_rate_limit ?? 50;

// iopub params for jupyter lab
const JUPYTERLAB_DATA =
  process.env.COCALC_JUPYTER_LAB_iopub_data_rate_limit ?? 2000000;
const JUPYTERLAB_MSGS =
  process.env.COCALC_JUPYTER_LAB_iopub_msg_rate_limit ?? 50;

const SPEC: { [name in NamedServerName]: CommandFunction } = {
  code: (ip: string, port: number) =>
    `code-server --bind-addr=${ip}:${port} --auth=none`,
  jupyter: (ip: string, port: number, basePath: string) =>
    [
      `jupyter notebook`,
      `--port-retries=0`,
      `--no-browser`,
      `--NotebookApp.iopub_data_rate_limit=${JUPYTERNB_DATA}`,
      `--NotebookApp.iopub_msg_rate_limit=${JUPYTERNB_MSGS}`,
      // we run Jupyter NB without authentication, because everything is proxied through CoCalc anyway
      `--NotebookApp.token='' --NotebookApp.password=''`,
      `--NotebookApp.allow_remote_access=True`,
      `--NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js`,
      `--NotebookApp.base_url=${basePath} --ip=${ip} --port=${port}`,
    ].join(" "),
  jupyterlab: (ip: string, port: number, basePath: string) =>
    [
      "jupyter lab",
      `--port-retries=0`, // don't try another port, only the one we specified will work
      `--no-browser`, // don't open a browser – the UI does this if appliable
      `--NotebookApp.iopub_data_rate_limit=${JUPYTERLAB_DATA}`,
      `--NotebookApp.iopub_msg_rate_limit=${JUPYTERLAB_MSGS}`,
      // we run Jupyter Lab without authentication, because everything is proxied through CoCalc anyway
      `--NotebookApp.token='' --NotebookApp.password=''`,
      // additionally to the above, and since several Jupyter Lab across projects might interfere with each other, we disable XSRF protection
      // see https://github.com/sagemathinc/cocalc/issues/6492
      `--ServerApp.disable_check_xsrf=True`, // Ref: https://jupyter-server.readthedocs.io/en/latest/other/full-config.html
      `--NotebookApp.allow_remote_access=True`,
      `--NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js`,
      `--NotebookApp.base_url=${basePath}`,
      `--ip=${ip}`,
      `--port=${port}`,
      `${JUPYTERLAB_RTC ? "--collaborative" : ""}`,
    ].join(" "),
  pluto: (ip: string, port: number) =>
    `echo 'import Pluto; Pluto.run(launch_browser=false, require_secret_for_access=false, host="${ip}", port=${port})' | julia`,
} as const;

export default function getSpec(name: NamedServerName): CommandFunction {
  const spec = SPEC[name];
  if (spec == null) {
    throw Error(`unknown named server: "${name}"`);
  }
  return spec;
}
