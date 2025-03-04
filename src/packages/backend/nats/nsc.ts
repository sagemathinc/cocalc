/*
Run the Nats nsc command line tool with appropriate environment.

https://docs.nats.io/using-nats/nats-tools/nsc

If you want to run nsc in a terminal, do this:

# DATA=your data/ directory, with data/nats, etc. in it, e.g.,
# in a dev install this is cocalc/src/data:

export DATA=$HOME/cocalc/src/data
export PATH=$DATA/nats/bin:$PATH
export XDG_DATA_HOME=$DATA
export XDG_CONFIG_HOME=$DATA
*/

import { bin, ensureInstalled } from "./install";
import { data } from "@cocalc/backend/data";
import { join } from "path";
import { executeCode } from "@cocalc/backend/execute-code";

export default async function nsc(args: string[]) {
  await ensureInstalled(); // make sure (once) that nsc is installed
  return await executeCode({
    command: join(bin, "nsc"),
    args,
    env: { XDG_DATA_HOME: data, XDG_CONFIG_HOME: data },
    // It is important to set this to false except maybe for temporary debugging!
    // Reason is that this command is used to get JWT's, which are basically private keys,
    // and it is very bad to log those.
    verbose: false,
  });
}
