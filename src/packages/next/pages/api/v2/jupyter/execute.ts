/*
Evaluation of code using a Jupyter kernel as a service.

The INPUT parameters are:

- kernel: the name of the Jupyter kernel
- history: list of previous inputs as string (in order) that were sent to the kernel.
- input: a new input

ALTERNATIVELY, can just give:

- sha1: hash of kernel/history/input

and if output is known it is returned. Otherwise, nothing happens.
We are trusting that there aren't sha1 hash collisions for this applications.

The OUTPUT is:

- a list of messages that describe the output of the last code execution.

*/
import { execute } from "@cocalc/server/jupyter/execute";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { analytics_cookie_name } from "@cocalc/util/misc";

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
  const { input, kernel, history, tag, noCache, sha1 } = getParams(req, {
    allowGet: true,
  });
  const account_id = await getAccountId(req);
  const analytics_cookie = req.cookies[analytics_cookie_name];
  return {
    output: await execute({
      account_id,
      analytics_cookie,
      input,
      sha1,
      history,
      kernel,
      tag,
      noCache,
    }),
  };
}
