/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// API endpoint for users to view and revoke their own OAuth2 authorizations.
// NOT admin-only — each user sees only their own tokens.

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      res.status(401).json({ error: "must be signed in" });
      return;
    }

    const { action, client_id } = getParams(req);

    if (action === "revoke" && client_id) {
      // Revoke all tokens for this client+user
      const pool = getPool();
      await pool.query(
        "DELETE FROM oauth2_access_tokens WHERE account_id = $1 AND client_id = $2",
        [account_id, client_id],
      );
      await pool.query(
        "DELETE FROM oauth2_refresh_tokens WHERE account_id = $1 AND client_id = $2",
        [account_id, client_id],
      );
      res.json({ ok: true });
    } else {
      // List authorized clients for this user, grouped by client
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT
           c.client_id,
           c.name,
           c.description,
           c.mode,
           COUNT(DISTINCT a.token) FILTER (WHERE a.expire > NOW()) AS active_access_tokens,
           COUNT(DISTINCT r.token) FILTER (WHERE r.expire > NOW()) AS active_refresh_tokens,
           GREATEST(MAX(a.last_active), MAX(r.last_active)) AS last_used,
           COALESCE(MAX(a.scope), MAX(r.scope)) AS scope,
           COALESCE(MAX(a.device_name), MAX(r.device_name)) AS device_name
         FROM oauth2_clients c
         LEFT JOIN oauth2_access_tokens a
           ON a.client_id = c.client_id AND a.account_id = $1
         LEFT JOIN oauth2_refresh_tokens r
           ON r.client_id = c.client_id AND r.account_id = $1
         WHERE a.account_id = $1 OR r.account_id = $1
         GROUP BY c.client_id, c.name, c.description, c.mode
         ORDER BY last_used DESC NULLS LAST`,
        [account_id],
      );
      // Include default native client info for the "how to connect" hint
      const settings = await getServerSettings();
      const defaultNativeClientId =
        settings.oauth2_default_native_client_id ?? "";
      // Prefer the OAuth2 issuer URL, fall back to dns
      const issuer = settings.oauth2_provider_issuer;
      const dns = settings.dns ?? "";
      const host = issuer
        ? issuer
        : dns.startsWith("http")
          ? dns
          : dns
            ? `https://${dns}`
            : "";
      res.json({
        authorizations: rows,
        default_native_client_id: defaultNativeClientId,
        host,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
