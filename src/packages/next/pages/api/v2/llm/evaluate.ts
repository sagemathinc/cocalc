// This is the new endpoint for querying any LLM
// Previously, this has been in openai/chatgpt

import type { Request, Response } from "express";

import { evaluate } from "@cocalc/server/llm/index";
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
  const { input, system, history, model, tag } = getParams(req);
  const account_id = await getAccountId(req);
  const anonymous_id = await getAnonymousID(req);
  return {
    output: await evaluate({
      account_id,
      anonymous_id,
      input,
      system,
      history,
      model,
      tag,
    }),
  };
}
