import { jupyter_execute_response } from "@cocalc/util/message";
import Kernel from "./kernel";

export default async function jupyterExecute(socket, mesg) {
  let kernel: undefined | Kernel = undefined;
  try {
    kernel = await Kernel.getFromPool(mesg.kernel);

    if (mesg.history != null && mesg.history.length > 0) {
      // just execute this directly, since we will ignore the output
      // TODO: enforce a timeout
      await kernel.execute(mesg.history.join("\n"));
    }

    const outputs = await kernel.execute(mesg.input);
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
