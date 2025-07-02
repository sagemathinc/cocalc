/*
~/cocalc/src/packages/project$ node
Welcome to Node.js v16.19.1.
Type ".help" for more information.

> e = require('@cocalc/jupyter/stateless-api/execute').default
> await e({input:'2+3',kernel:'python3-ubuntu'})
[ { data: { 'text/plain': '5' } } ]
>
*/

import Kernel from "./kernel";
import getLogger from "@cocalc/backend/logger";
import { type ProjectJupyterApiOptions } from "@cocalc/util/jupyter/api-types";

const log = getLogger("jupyter:stateless-api:execute");

export default async function jupyterExecute(opts: ProjectJupyterApiOptions) {
  log.debug(opts);
  let kernel: undefined | Kernel = undefined;
  try {
    kernel = await Kernel.getFromPool(opts.kernel, opts.pool);
    const outputs: object[] = [];

    if (opts.path != null) {
      try {
        await kernel.chdir(opts.path);
        log.debug("successful chdir");
      } catch (err) {
        outputs.push({ name: "stderr", text: `${err}` });
        log.debug("chdir failed", err);
      }
    }

    if (opts.history != null && opts.history.length > 0) {
      // just execute this directly, since we will ignore the output
      log.debug("evaluating history");
      await kernel.execute(opts.history.join("\n"), opts.limits);
    }

    // append the output of running opts.input to outputs:
    for (const output of await kernel.execute(opts.input, opts.limits)) {
      outputs.push(output);
    }
    return outputs;
  } finally {
    if (kernel) {
      kernel.close();
    }
  }
}
