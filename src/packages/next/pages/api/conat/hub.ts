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
   http://localhost:9000/api/conat/hub

The api is defined in packages/conat/hub/api/
*/

import hubBridge from "@cocalc/server/api/hub-bridge";
import getParams from "lib/api/get-params";
import { getAccountFromApiKey, hasScope } from "@cocalc/server/auth/api";
import { isUserQueryWrite } from "@cocalc/database/user-query-classify";

// Allowlist: methods that are safe with only api:read.
// Everything NOT in this set requires api:write for OAuth2 tokens.
const READ_ONLY_METHODS = new Set([
  "system.ping",
  "system.getNames",
  "system.userSearch",
  "system.test",
  "system.getCustomize",
  "projects.get",
  "projects.state",
  "projects.status",
  "projects.getCollaborators",
  "jupyter.kernels",
  "sync.history",
  "messages.get",
]);

export default async function handle(req, res) {
  try {
    const { account_id, scope } = (await getAccountFromApiKey(req)) ?? {};
    if (!account_id) {
      res.status(401).json({
        error:
          "must be signed in and MUST provide an api key (cookies are not allowed)",
      });
      return;
    }
    const { name, args, timeout } = getParams(req);

    // Enforce OAuth2 scopes (API keys have scope=undefined → unrestricted)
    if (scope != null) {
      // Must have at least api:read
      if (!hasScope(scope, "api:read") && !hasScope(scope, "api:write")) {
        res.status(403).json({
          error: "OAuth2 token does not have api:read or api:write scope",
        });
        return;
      }

      // db.userQuery: classify as read or write based on query shape.
      // The args may contain multiple queries — check ALL of them.
      // Also check options[].set/delete which override the null-leaf heuristic
      // in the DB layer (postgres-user-queries.coffee line 148-149).
      if (name === "db.userQuery") {
        // Validate the top-level args shape BEFORE iterating so a
        // non-array value cannot fall through to the generic catch
        // (which was 500 rather than the intended 400). The scope gate
        // here is load-bearing — fail closed and explicitly.
        if (!Array.isArray(args)) {
          res.status(400).json({
            error: "invalid db.userQuery payload: `args` must be an array",
          });
          return;
        }
        for (const arg of args) {
          if (arg == null || typeof arg !== "object") {
            res.status(400).json({
              error:
                "invalid db.userQuery payload: each arg must be an object",
            });
            return;
          }
          const query = arg.query;
          if (query == null || typeof query !== "object") {
            res.status(400).json({
              error: "invalid db.userQuery payload: `query` must be an object",
            });
            return;
          }
          const options = arg.options ?? [];
          if (options !== undefined && !Array.isArray(options)) {
            res.status(400).json({
              error:
                "invalid db.userQuery payload: `options` must be an array",
            });
            return;
          }
          const hasSetOption = (options as any[]).some(
            (o: any) => o?.set || o?.delete,
          );
          if (
            (isUserQueryWrite(query) || hasSetOption) &&
            !hasScope(scope, "api:write")
          ) {
            res.status(403).json({
              error:
                "OAuth2 token requires api:write scope for write operations via db.userQuery",
            });
            return;
          }
        }
      } else if (
        !READ_ONLY_METHODS.has(name) &&
        !hasScope(scope, "api:write")
      ) {
        // Any method not in the read-only allowlist requires api:write
        res.status(403).json({
          error: `OAuth2 token requires api:write scope for ${name}`,
        });
        return;
      }
    }

    const resp = await hubBridge({ account_id, name, args, timeout });
    res.json(resp);
  } catch (err) {
    // Unexpected error (DB, RPC, etc.) — client-visible messages above are
    // early-return with proper status codes; anything reaching here is 500.
    res.status(500).json({ error: err.message });
  }
}
