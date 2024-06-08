/*
Get A Single Template
*/

import { getTemplate } from "@cocalc/server/compute/templates";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerTemplateInputSchema,
  GetComputeServerTemplateOutputSchema,
} from "lib/api/schema/compute/get-template";


async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const { id } = getParams(req);
  return await getTemplate(id);
}

export default apiRoute({
  getTemplate: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerTemplateInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerTemplateOutputSchema,
      },
    ])
    .handler(handle),
});
