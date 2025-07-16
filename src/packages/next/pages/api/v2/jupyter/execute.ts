/*
Evaluation of code using a Jupyter kernel as a service.

The INPUT parameters are:

- kernel: the name of the Jupyter kernel
- history: list of previous inputs as string (in order) that were sent to the kernel.
- input: a new input

ALTERNATIVELY, can just give:

- hash: hash of kernel/history/input

and if output is known it is returned. Otherwise, nothing happens.
We are trusting that there aren't hash collisions for this applications,
since we're using a sha1 hash.

The OUTPUT is:

- a list of messages that describe the output of the last code execution.

*/

import type { Request, Response } from "express";

import { execute } from "@cocalc/server/jupyter/execute";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { getAnonymousID } from "lib/user-id";

export default async function handle(req: Request, res: Response) {
  try {
    const result = await doIt(req);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req: Request) {
  const { input, kernel, history, tag, noCache, hash, project_id, path } =
    getParams(req);
  const account_id = await getAccountId(req);
  const anonymous_id = await getAnonymousID(req);
  return await execute({
    account_id,
    project_id,
    path,
    anonymous_id,
    input,
    hash,
    history,
    kernel,
    tag,
    noCache,
  });
}
