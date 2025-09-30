/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This file defines all of the named servers we support.

To add another one, define a new entry in SPEC:

- The key is the name of the server.
- The value is a string this a function of (ip, port, basePath).  The string
  is a bash shell command that when run starts the server.  It might optionally
  use process.env so that the env can influence command line options.
*/

import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NamedServerName } from "@cocalc/util/types/servers";

type CommandFunction = (
  ip: string,
  port: number,
  basePath: string,
) => Promise<string[]>;

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

async function rserver(
  _ip: string,
  port: number,
  basePath: string,
): Promise<string[]> {
  // tmp: this is used to write a small config file and then use it
  const tmp = join(process.env.TMP ?? "/tmp", "rserver");
  await mkdir(tmp, { recursive: true });
  const home = process.env.HOME ?? "/home/user";
  // ATTN: by trial and error I learned this must be in the home dir (not tmp) – otherwise silent crash
  // Also, that dir name has a length limit (unknown), does not work for nested dev-in-project
  const data = join(home, ".config", "rserver");
  const data_db = join(data, "db");
  // This creates the tmp dir, and the data dir, and the data/db dir
  await mkdir(data_db, { recursive: true });
  const db_conf = join(tmp, "db.conf");
  await writeFile(db_conf, `provider=sqlite\ndirectory=${data_db}`);

  // ATTN: it's tempting to add --www-address=${ip} \
  // to tell it where to listen to, but for some reason that doesn't work. Hence $ip is ignored.
  // The default is 0.0.0.0, which works (and it's fine, because we proxy it anyway).

  // Check, if the user $USER exists in /etc/passwd using grep. If not, call the user "user".
  // Just process.env.USER does not work in development, i.e. when the "random id" user does not exist.
  const user = await new Promise<string>((resolve) => {
    const name = process.env.USER ?? "user";
    exec(`grep "^${name}:" /etc/passwd`, (err) => {
      resolve(err ? "user" : name);
    });
  });

  // watch out, this will be prefixed with #!/bin/sh and piped into stdout/stderr files
  // part from that, rserver must be in the $PATH
  // see note at project/configuration::get_rserver
  if (!basePath.endsWith("/")) {
    basePath += "/";
  }
  return [
    `rserver`,
    `--server-daemonize=0`,
    `--auth-none=1`,
    `--auth-encrypt-password=0`,
    `--server-user=${user}`,
    `--database-config-file=${db_conf}`,
    `--server-data-dir=${data}`,
    `--server-working-dir=${process.env.HOME}`,
    `--www-port=${port}`,
    `--www-root-path=${basePath}`,
    `--server-pid-file=${join(tmp, "rserver.pid")}`,
    "--auth-minimum-user-id=0",
  ];
}

const SPEC: { [name in NamedServerName]: CommandFunction } = {
  xpra: async (ip: string, port: number) => [
    "xpra",
    "start",
    `--bind-tcp=${ip}:${port}`,
    "--sharing=yes",
    "--daemon=no",
    "--start=/usr/bin/xterm",
  ],
  code: async (ip: string, port: number) => [
    `code-server`,
    `--bind-addr=${ip}:${port}`,
    `--auth=none`,
  ],

  jupyter: async (ip: string, port: number, basePath: string) => [
    `jupyter`,
    `notebook`,
    `--allow-root`,
    `--port-retries=0`,
    `--no-browser`,
    `--NotebookApp.iopub_data_rate_limit=${JUPYTERNB_DATA}`,
    `--NotebookApp.iopub_msg_rate_limit=${JUPYTERNB_MSGS}`,
    `--NotebookApp.token=`,
    `--NotebookApp.password=`,
    `--NotebookApp.allow_remote_access=True`,
    `--NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js`,
    `--NotebookApp.base_url=${basePath}`,
    `--ip=${ip}`,
    `--port=${port}`,
  ],

  jupyterlab: async (ip: string, port: number, basePath: string) => [
    "jupyter",
    "lab",
    `--allow-root`,
    `--port-retries=0`, // don't try another port, only the one we specified will work
    `--no-browser`, // don't open a browser – the UI does this if appliable
    `--NotebookApp.iopub_data_rate_limit=${JUPYTERLAB_DATA}`,
    `--NotebookApp.iopub_msg_rate_limit=${JUPYTERLAB_MSGS}`,
    `--NotebookApp.token=`,
    `--NotebookApp.password=`,
    // additionally to the above, and since several Jupyter Lab across projects might interfere with each other, we disable XSRF protection
    // see https://github.com/sagemathinc/cocalc/issues/6492
    `--ServerApp.disable_check_xsrf=True`, // Ref: https://jupyter-server.readthedocs.io/en/latest/other/full-config.html
    `--NotebookApp.allow_remote_access=True`,
    `--NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js`,
    `--NotebookApp.base_url=${basePath}`,
    `--ip=${ip}`,
    `--port=${port}`,
    // could be an option, but requires another package which could be tricky to install... "pip install jupyter_collaboration";
    // on standard ubuntu 25.04 i got errors trying to install this package.  This should thus be optional and maybe part
    // of some special container or package or something (?).
    // TODO: We need to make it easy for users to customize app launchers.
    // `--collaborative`,
  ],

  pluto: async (ip: string, port: number) => [
    `julia`,
    `-e`,
    `import Pluto; Pluto.run(launch_browser=false, require_secret_for_access=false, host="${ip}", port=${port})`,
  ],
  rserver,
} as const;

export default function getSpec(name: string): CommandFunction {
  const spec = SPEC[name];
  if (spec == null) {
    throw Error(`unknown application: "${name}"`);
  }
  return spec;
}
