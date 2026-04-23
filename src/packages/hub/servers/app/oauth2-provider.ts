/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Initialize the OAuth2 Provider endpoints on the hub's Express router.

import type { Router } from "express";

import basePath from "@cocalc/backend/base-path";
import { getLogger } from "@cocalc/backend/logger";
import getAccountId from "@cocalc/server/auth/get-account";
import { getServerSettings } from "@cocalc/database/settings";
import {
  createOAuth2Client,
  createOAuth2Provider,
  listOAuth2Clients,
} from "@cocalc/auth/lib/index";
import { getAdmins } from "@cocalc/server/accounts/is-admin";
import { join } from "path";

const logger = getLogger("hub:oauth2-provider");

import getPool from "@cocalc/database/pool";

const SETTING_NAME = "oauth2_default_native_client_id";

/**
 * Ensure a default native client exists for CLI/desktop usage.
 * The client_id is persisted in server_settings so renaming the client
 * or restarting the hub doesn't cause duplicates.
 */
async function ensureDefaultNativeClient(): Promise<string | null> {
  try {
    const pool = getPool();

    // Check if we already have a stored default client_id
    const { rows } = await pool.query(
      "SELECT value FROM server_settings WHERE name = $1",
      [SETTING_NAME],
    );
    if (rows.length > 0 && rows[0].value) {
      const clientId = rows[0].value;
      // Verify the client still exists
      const clients = await listOAuth2Clients();
      if (clients.some((c) => c.client_id === clientId)) {
        return clientId;
      }
      // Client was deleted — fall through to re-create
      logger.info("Default native client was deleted — re-creating");
    }

    // Need an admin account_id as the creator
    const admins = await getAdmins();
    if (admins.size === 0) {
      logger.warn(
        "Cannot auto-create default native OAuth2 client — no admin accounts found",
      );
      return null;
    }
    const adminId = admins.values().next().value!;

    const result = await createOAuth2Client({
      name: "CoCalc CLI",
      description:
        "Default native client for cocalc-api CLI and desktop apps.",
      mode: "native",
      redirect_uris: ["http://localhost/authorize/"],
      scopes: ["openid", "profile", "email", "api:read", "api:project"],
      created_by: adminId,
    });

    // Persist the client_id in server_settings
    await pool.query(
      `INSERT INTO server_settings (name, value) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET value = $2`,
      [SETTING_NAME, result.client_id],
    );

    logger.info(
      `Auto-created default native OAuth2 client: ${result.client_id}`,
    );
    return result.client_id;
  } catch (err) {
    logger.error("Failed to auto-create default native client", err);
    return null;
  }
}

export default async function initOAuth2Provider(
  router: Router,
): Promise<void> {
  logger.info("initializing OAuth2 Provider endpoints");

  const settings = await getServerSettings();
  if (!settings.oauth2_provider_enabled) {
    logger.info("OAuth2 Provider is disabled — skipping");
    return;
  }

  // Determine the issuer URL
  let issuer = settings.oauth2_provider_issuer;
  if (!issuer) {
    // Fall back to the dns setting
    const dns = settings.dns;
    if (dns) {
      issuer = dns.startsWith("http") ? dns : `https://${dns}`;
    } else {
      issuer = "http://localhost";
    }
  }

  // Ensure a default native client exists for CLI usage
  const nativeClientId = await ensureDefaultNativeClient();

  const authBasePath = join(basePath, "auth");
  const signInUrl = join(basePath, "auth/sign-in");

  const oauth2Router = createOAuth2Provider({
    issuer,
    basePath: authBasePath,
    getAccountId: async (req) => {
      const accountId = await getAccountId(req);
      return accountId ?? null;
    },
    signInUrl,
    nativeClientId: nativeClientId ?? undefined,
  });

  // Mount the OAuth2 provider under /auth
  router.use("/auth", oauth2Router);

  // Redirect /.well-known/oauth-authorization-server at the root to /auth/...
  // so the RFC 8414 path works without the /auth prefix.
  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.redirect(
      join(basePath, "auth/.well-known/oauth-authorization-server"),
    );
  });

  logger.info(
    `OAuth2 Provider initialized (issuer=${issuer}, nativeClientId=${nativeClientId ?? "none"})`,
  );
}
