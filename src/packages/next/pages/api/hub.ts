/*
This is a bridge to call the Conat rpc api that is offered by the hub.
This is meant to be called by account users *NOT* the project. That's why
you must provide an api key for an account.

For security reasons this is ONLY usable via an API key -- using an account
is not allowed, since that opens us to XSS attacks.

Here is an example of how this would be used:

key=sk-...02

curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"name":"system.getNames", "args":[["d0bdabfd-850e-4c8d-8510-f6f1ecb9a5eb"]]}' \
   http://localhost:9000/api/hub

The api is defined in packages/conat/hub/api/
*/

import hubBridge from "@cocalc/server/api/hub-bridge";
import getParams from "lib/api/get-params";
import { getAccountFromApiKey } from "@cocalc/server/auth/api";

export default async function handle(req, res) {
  try {
    const { account_id } = (await getAccountFromApiKey(req)) ?? {};
    if (!account_id) {
      throw Error(
        "must be signed in and MUST provide an api key (cookies are not allowed)",
      );
    }
    const { name, args, timeout } = getParams(req);
    const resp = await hubBridge({ account_id, name, args, timeout });
    res.json(resp);
  } catch (err) {
    res.json({ error: err.message });
  }
}
