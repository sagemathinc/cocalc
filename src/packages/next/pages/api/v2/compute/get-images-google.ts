/*
Get all google cloud images.
*/

import getAccountId from "lib/account/get-account";
import { getAllImages } from "@cocalc/server/compute/cloud/google-cloud/images";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerGoogleImagesInputSchema,
  GetComputeServerGoogleImagesOutputSchema,
} from "lib/api/schema/compute/get-images-google";

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
  return await getAllImages({ noCache: !!noCache, account_id });
}

export default apiRoute({
  getImagesGoogle: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerGoogleImagesInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerGoogleImagesOutputSchema,
      },
    ])
    .handler(handle),
});
