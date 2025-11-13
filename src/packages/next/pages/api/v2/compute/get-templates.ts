/*
Get Templates
*/

import { getTemplates } from "@cocalc/server/compute/templates";

import { apiRoute, apiRouteOperation } from "lib/api";
import { GetComputeServerTemplatesOutputSchema } from "lib/api/schema/compute/get-templates";

async function handle(_req, res) {
  try {
    res.json(await await getTemplates());
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

export default apiRoute({
  getTemplates: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerTemplatesOutputSchema,
      },
    ])
    .handler(handle),
});
