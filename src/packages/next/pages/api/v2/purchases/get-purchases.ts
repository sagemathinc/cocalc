/*
Let user get all of their purchases
*/

import getAccountId from "lib/account/get-account";
import getPurchases from "@cocalc/server/purchases/get-purchases";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetPurchasesInputSchema,
  GetPurchasesOutputSchema,
} from "lib/api/schema/purchases/get-purchases";
import throttle from "@cocalc/util/api/throttle";

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
    limit,
    offset,
    service,
    project_id,
    group,
    cutoff,
    thisMonth,
    day_statement_id,
    month_statement_id,
    no_statement,
    compute_server_id,
  } = getParams(req);
  if (!compute_server_id) {
    // for now we are only throttling when compute_server_id is NOT set.  There are several cases -- course management etc
    // where a client calls get-purchases for each compute server separately with group -- it's not much load.
    throttle({
      account_id,
      endpoint: "purchases/get-purchases",
    });
  }
  return await getPurchases({
    cutoff,
    thisMonth,
    limit,
    offset,
    service,
    account_id,
    project_id,
    group,
    day_statement_id,
    month_statement_id,
    no_statement,
    compute_server_id,
  });
}

export default apiRoute({
  getPurchases: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Purchases"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetPurchasesInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetPurchasesOutputSchema,
      },
    ])
    .handler(handle),
});
