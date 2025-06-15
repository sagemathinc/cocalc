/*
~/cocalc/src/packages/project$ node
Welcome to Node.js v16.19.1.
Type ".help" for more information.
> e = require('@cocalc/jupyter/stateless-api/kernel').default; z = await e.getFromPool('python3'); await z.execute("2+3")
[ { data: { 'text/plain': '5' } } ]
>
*/

import { jupyter_execute_response } from "@cocalc/util/message";
import Kernel from "./kernel";
import getLogger from "@cocalc/backend/logger";
const log = getLogger("jupyter:stateless-api:execute");

export default async function jupyterExecute(socket, mesg) {
  log.debug(mesg);
  let kernel: undefined | Kernel = undefined;
  try {
    kernel = await Kernel.getFromPool(mesg.kernel, mesg.pool);
    const outputs: object[] = [];

    if (mesg.path != null) {
      try {
        await kernel.chdir(mesg.path);
        log.debug("successful chdir");
      } catch (err) {
        outputs.push({ name: "stderr", text: `${err}` });
        log.debug("chdir failed", err);
      }
    }

    if (mesg.history != null && mesg.history.length > 0) {
      // just execute this directly, since we will ignore the output
      log.debug("evaluating history");
      await kernel.execute(mesg.history.join("\n"), mesg.limits);
    }

    // append the output of running mesg.input to outputs:
    for (const output of await kernel.execute(mesg.input, mesg.limits)) {
      outputs.push(output);
    }
    socket.write_mesg(
      "json",
      jupyter_execute_response({ id: mesg.id, output: outputs })
    );
  } finally {
    if (kernel) {
      await kernel.close();
    }
  }
}
