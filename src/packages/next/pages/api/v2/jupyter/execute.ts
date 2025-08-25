/*
Evaluation of code using a Jupyter kernel as a service.

The INPUT parameters are:

- kernel: the name of the Jupyter kernel
- history: list of previous inputs as string (in order) that were sent to the kernel.
- input: a new input

The OUTPUT is:

- a list of messages that describe the output of the last code execution.

*/
import { execute } from "@cocalc/server/jupyter/execute";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const result = await doIt(req);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const { input, kernel, history, tag, project_id, path } = getParams(req);
  const account_id = await getAccountId(req);
  return await execute({
    account_id,
    project_id,
    path,
    input,
    history,
    kernel,
    tag,
  });
}
