import { jupyter_execute_response } from "@cocalc/util/message";
import {
  kernel as createKernel,
  JupyterKernel,
} from "@cocalc/project/jupyter/jupyter";

export default async function jupyterExecute(socket, mesg) {
  let kernel: undefined | JupyterKernel = undefined;
  try {
    kernel = createKernel({
      name: mesg.kernel,
      path: `${Math.random()}.ipynb`,
    });
    if (mesg.history != null && mesg.history.length > 0) {
      await kernel.execute_code_now({ code: mesg.history.join("\n") });
    }
    const output = await kernel.execute_code_now({ code: mesg.input });
    socket.write_mesg(
      "json",
      jupyter_execute_response({ id: mesg.id, output })
    );
  } finally {
    kernel?.close();
  }
}
