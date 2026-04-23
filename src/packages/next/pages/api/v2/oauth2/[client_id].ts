/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// API endpoint for managing a single OAuth2 client.
// GET    - get client details (admin only)
// PATCH  - update client (admin only)
// DELETE - delete client (admin only)

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import {
  deleteOAuth2Client,
  getClientPublic,
  updateOAuth2Client,
  regenerateClientSecret,
} from "@cocalc/auth/lib/index";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      res.status(401).json({ error: "must be signed in" });
      return;
    }
    if (!(await userIsInGroup(account_id, "admin"))) {
      res
        .status(403)
        .json({ error: "only admins can manage OAuth2 clients" });
      return;
    }

    const { client_id } = req.query;
    if (!client_id || typeof client_id !== "string") {
      res.status(400).json({ error: "client_id is required" });
      return;
    }

    if (req.method === "GET") {
      const client = await getClientPublic(client_id);
      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }
      res.json(client);
    } else if (req.method === "PATCH") {
      const { name, description, mode, redirect_uris, scopes, active } =
        getParams(req);
      const client = await updateOAuth2Client(client_id, {
        name,
        description,
        mode,
        redirect_uris,
        scopes,
        active,
      });
      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }
      res.json(client);
    } else if (req.method === "DELETE") {
      await deleteOAuth2Client(client_id);
      res.json({ ok: true });
    } else if (req.method === "POST") {
      // POST with action parameter (since the frontend api() only does POST)
      const params = getParams(req);
      const action = params.action;
      if (action === "regenerate-secret") {
        const newSecret = await regenerateClientSecret(client_id);
        res.json({ client_secret: newSecret });
      } else if (action === "delete") {
        await deleteOAuth2Client(client_id);
        res.json({ ok: true });
      } else {
        // No action = treat as PATCH (update fields)
        const { name, description, mode, redirect_uris, scopes, active } =
          params;
        const client = await updateOAuth2Client(client_id, {
          name,
          description,
          mode,
          redirect_uris,
          scopes,
          active,
        });
        if (!client) {
          res.status(404).json({ error: "Client not found" });
          return;
        }
        res.json(client);
      }
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
