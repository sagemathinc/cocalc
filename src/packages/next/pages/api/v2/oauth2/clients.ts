/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// API endpoint for managing OAuth2 clients.
// GET  - list all clients with token stats (admin only)
// POST - create a new client (admin only)

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import {
  createOAuth2Client,
  listOAuth2ClientsWithStats,
} from "@cocalc/auth/lib/index";
import { getServerSettings } from "@cocalc/database/settings";

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

    const { name, description, mode, redirect_uris, scopes } = getParams(req);

    if (name) {
      // Create a new client
      if (!redirect_uris || !Array.isArray(redirect_uris)) {
        res
          .status(400)
          .json({ error: "redirect_uris must be an array of URIs" });
        return;
      }
      const result = await createOAuth2Client({
        name,
        description,
        mode,
        redirect_uris,
        scopes,
        created_by: account_id,
      });
      res.json(result);
    } else {
      // List all clients
      const clients = await listOAuth2ClientsWithStats();
      const settings = await getServerSettings();
      res.json({
        clients,
        enabled: !!settings.oauth2_provider_enabled,
        default_native_client_id:
          settings.oauth2_default_native_client_id ?? "",
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
