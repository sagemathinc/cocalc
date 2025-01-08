/*
Create a compute server
*/

import getAccountId from "lib/account/get-account";
import createServer from "@cocalc/server/compute/create-server";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import {
  CreateServerInputSchema,
  CreateServerOutputSchema,
} from "lib/api/schema/compute/create-server";

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
    autorestart,
    cloud,
    configuration,
    notes,
    course_project_id,
    course_server_id,
  } = getParams(req);
  return await createServer({
    account_id,
    project_id,
    title,
    color,
    autorestart,
    cloud,
    configuration,
    notes,
    course_project_id,
    course_server_id,
  });
}

export default apiRoute({
  createServer: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: CreateServerInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: CreateServerOutputSchema,
      },
    ])
    .handler(handle),
});
