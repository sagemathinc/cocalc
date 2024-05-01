/*
Create a compute server
*/

import getAccountId from "lib/account/get-account";
import createServer from "@cocalc/server/compute/create-server";
import getParams from "lib/api/get-params";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  const {
    project_id,
    title,
    color,
    idle_timeout,
    autorestart,
    cloud,
    configuration,
    notes,
  } = getParams(req);
  return await createServer({
    account_id,
    project_id,
    title,
    color,
    idle_timeout,
    autorestart,
    cloud,
    configuration,
    notes,
  });
}

import { z } from "zod";
import { apiRoute, apiRouteOperation } from "next-rest-framework";

export default apiRoute({
  computeCreateServer: apiRouteOperation({
    method: "POST",
  })
    .input({
      contentType: "application/json",
      body: z
        .object({
          project_id: z.string(),
          title: z.string(),
          color: z.string(),
          idle_timeout: z.number().optional(),
          autorestart: z.boolean().optional(),
          cloud: z.string(),
          configuration: z.record(z.unknown()),
          notes: z.string().optional(),
        })
        .describe("Parameters that define a compute server."),
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: z.number().describe("The id of the compute server."),
      },
    ])
    .handler(handle),
});
