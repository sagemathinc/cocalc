/*
Get IMAGES.
*/

import getAccountId from "lib/account/get-account";
import { getImages } from "@cocalc/server/compute/images";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerImagesInputSchema,
  GetComputeServerImagesOutputSchema,
} from "lib/api/schema/compute/get-images";

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
  let { noCache } = getParams(req);
  return await getImages({ noCache: !!noCache, account_id });
}

export default apiRoute({
  getImages: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerImagesInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerImagesOutputSchema,
      },
    ])
    .handler(handle),
});
