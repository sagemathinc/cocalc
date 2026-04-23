/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Database operations for the OAuth2 Provider.
// Uses the PostgreSQL pool from @cocalc/database.
//
// NOTE: All token/code tables use the field name "expire" (not "expires")
// so the built-in CoCalc maintenance service (delete_expired) automatically
// cleans up expired rows. See hub/run/maintenance-expired.js.

import { getLogger } from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

import type {
  AccessToken,
  AuthorizationCode,
  OAuth2Client,
  OAuth2ClientPublic,
  RefreshToken,
} from "./types";

const logger = getLogger("auth:oauth2-database");

// ---- OAuth2 Clients ----

export async function createClient(
  client: Omit<OAuth2Client, "created" | "modified">,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO oauth2_clients
       (client_id, client_secret_hash, name, description, mode, redirect_uris,
        grant_types, scopes, created_by, created, modified, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)`,
    [
      client.client_id,
      client.client_secret_hash,
      client.name,
      client.description,
      client.mode ?? "web",
      JSON.stringify(client.redirect_uris),
      JSON.stringify(client.grant_types),
      JSON.stringify(client.scopes),
      client.created_by,
      client.active,
    ],
  );
}

export async function getClient(
  clientId: string,
): Promise<OAuth2Client | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM oauth2_clients WHERE client_id = $1`,
    [clientId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    redirect_uris:
      typeof row.redirect_uris === "string"
        ? JSON.parse(row.redirect_uris)
        : row.redirect_uris,
    grant_types:
      typeof row.grant_types === "string"
        ? JSON.parse(row.grant_types)
        : row.grant_types,
    scopes:
      typeof row.scopes === "string" ? JSON.parse(row.scopes) : row.scopes,
  };
}

export async function getClientPublic(
  clientId: string,
): Promise<OAuth2ClientPublic | null> {
  const client = await getClient(clientId);
  if (!client) return null;
  const { client_secret_hash: _, ...pub } = client;
  return pub;
}

export async function listClients(): Promise<OAuth2ClientPublic[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT client_id, name, description, mode, redirect_uris, grant_types,
            scopes, created_by, created, modified, active
     FROM oauth2_clients ORDER BY created DESC`,
  );
  return rows.map((row) => ({
    ...row,
    redirect_uris:
      typeof row.redirect_uris === "string"
        ? JSON.parse(row.redirect_uris)
        : row.redirect_uris,
    grant_types:
      typeof row.grant_types === "string"
        ? JSON.parse(row.grant_types)
        : row.grant_types,
    scopes:
      typeof row.scopes === "string" ? JSON.parse(row.scopes) : row.scopes,
  }));
}

export async function updateClient(
  clientId: string,
  updates: Partial<
    Pick<
      OAuth2Client,
      | "name"
      | "description"
      | "mode"
      | "redirect_uris"
      | "grant_types"
      | "scopes"
      | "active"
      | "client_secret_hash"
    >
  >,
): Promise<void> {
  const pool = getPool();
  const setClauses: string[] = ["modified = NOW()"];
  const values: any[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    values.push(updates.description);
  }
  if (updates.mode !== undefined) {
    setClauses.push(`mode = $${paramIdx++}`);
    values.push(updates.mode);
  }
  if (updates.redirect_uris !== undefined) {
    setClauses.push(`redirect_uris = $${paramIdx++}`);
    values.push(JSON.stringify(updates.redirect_uris));
  }
  if (updates.grant_types !== undefined) {
    setClauses.push(`grant_types = $${paramIdx++}`);
    values.push(JSON.stringify(updates.grant_types));
  }
  if (updates.scopes !== undefined) {
    setClauses.push(`scopes = $${paramIdx++}`);
    values.push(JSON.stringify(updates.scopes));
  }
  if (updates.active !== undefined) {
    setClauses.push(`active = $${paramIdx++}`);
    values.push(updates.active);
  }
  if (updates.client_secret_hash !== undefined) {
    setClauses.push(`client_secret_hash = $${paramIdx++}`);
    values.push(updates.client_secret_hash);
  }

  values.push(clientId);
  await pool.query(
    `UPDATE oauth2_clients SET ${setClauses.join(", ")} WHERE client_id = $${paramIdx}`,
    values,
  );
}

export async function deleteClient(clientId: string): Promise<void> {
  const pool = getPool();
  // Also clean up all tokens and codes for this client
  await pool.query(
    `DELETE FROM oauth2_authorization_codes WHERE client_id = $1`,
    [clientId],
  );
  await pool.query(`DELETE FROM oauth2_access_tokens WHERE client_id = $1`, [
    clientId,
  ]);
  await pool.query(`DELETE FROM oauth2_refresh_tokens WHERE client_id = $1`, [
    clientId,
  ]);
  await pool.query(`DELETE FROM oauth2_clients WHERE client_id = $1`, [
    clientId,
  ]);
}

// ---- Authorization Codes ----

export async function saveAuthorizationCode(
  code: AuthorizationCode,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO oauth2_authorization_codes
       (code, client_id, account_id, redirect_uri, scope,
        code_challenge, code_challenge_method, device_name, expire)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      code.code,
      code.client_id,
      code.account_id,
      code.redirect_uri,
      code.scope,
      code.code_challenge ?? null,
      code.code_challenge_method ?? null,
      code.device_name ?? null,
      code.expire,
    ],
  );
}

/**
 * Consume an authorization code (single-use). The DELETE is bound to
 * client_id so a code cannot be burned by a different client that
 * happened to intercept it. RFC 6749 §4.1.3 requires the server to
 * ensure the code was issued to the client presenting it BEFORE
 * invalidating it.
 */
export async function consumeAuthorizationCode(
  code: string,
  clientId: string,
): Promise<AuthorizationCode | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `DELETE FROM oauth2_authorization_codes
     WHERE code = $1 AND client_id = $2 AND expire > NOW() AND type = 'code'
     RETURNING *`,
    [code, clientId],
  );
  if (rows.length === 0) return null;
  return rows[0] as AuthorizationCode;
}

// ---- Consent Nonces (CSRF protection for the consent form) ----

const CONSENT_NONCE_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes

export async function saveConsentNonce(nonce: string, clientId: string, accountId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO oauth2_authorization_codes
       (code, client_id, account_id, redirect_uri, scope, type, expire)
     VALUES ($1, $2, $3, '', '', 'consent_nonce', $4)`,
    [nonce, clientId, accountId, new Date(Date.now() + CONSENT_NONCE_LIFETIME_MS)],
  );
}

export async function consumeConsentNonce(nonce: string, clientId: string, accountId: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM oauth2_authorization_codes
     WHERE code = $1 AND client_id = $2 AND account_id = $3
       AND type = 'consent_nonce' AND expire > NOW()`,
    [nonce, clientId, accountId],
  );
  return (rowCount ?? 0) > 0;
}

// ---- Access Tokens ----

// Only write last_active if it's been at least this long since the last write.
// Avoids a DB write on every single API call.
const LAST_ACTIVE_UPDATE_INTERVAL_S = 5 * 60; // 5 minutes

export async function saveAccessToken(token: AccessToken): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO oauth2_access_tokens
       (token, client_id, account_id, scope, device_name, expire, last_active)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [token.token, token.client_id, token.account_id, token.scope, token.device_name ?? null, token.expire],
  );
}

/**
 * Look up an access token. Updates last_active only if the previous
 * value is NULL or older than LAST_ACTIVE_UPDATE_INTERVAL_S.
 */
export async function getAccessToken(
  token: string,
): Promise<AccessToken | null> {
  const pool = getPool();
  // Read-only lookup (cheap)
  const { rows } = await pool.query(
    `SELECT * FROM oauth2_access_tokens WHERE token = $1 AND expire > NOW()`,
    [token],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as AccessToken;

  // Conditionally update last_active — only if stale or NULL
  if (
    !row.last_active ||
    Date.now() - new Date(row.last_active).getTime() >
      LAST_ACTIVE_UPDATE_INTERVAL_S * 1000
  ) {
    // fire-and-forget: don't await, the read already succeeded.
    // .catch() on the promise so a DB write failure does not surface
    // as an unhandled rejection (which would crash under strict-mode
    // Node) and is at least logged.
    pool
      .query(
        `UPDATE oauth2_access_tokens SET last_active = NOW()
         WHERE token = $1`,
        [token],
      )
      .catch((err) =>
        logger.warn("failed to update oauth2_access_tokens.last_active", err),
      );
  }

  return row;
}

export async function revokeAccessToken(
  token: string,
  clientId: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM oauth2_access_tokens WHERE token = $1 AND client_id = $2`,
    [token, clientId],
  );
}

export async function revokeRefreshToken(
  token: string,
  clientId: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM oauth2_refresh_tokens WHERE token = $1 AND client_id = $2`,
    [token, clientId],
  );
}

// ---- Refresh Tokens ----

export async function saveRefreshToken(token: RefreshToken): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO oauth2_refresh_tokens
       (token, client_id, account_id, scope, device_name, expire, last_active)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [token.token, token.client_id, token.account_id, token.scope, token.device_name ?? null, token.expire],
  );
}

/**
 * Consume a refresh token for rotation (native clients).
 * Atomically deletes the token row (single-use) and returns its data.
 * This prevents replay attacks — once consumed, the token is gone.
 * If the client loses the response, it must re-authenticate.
 * The WHERE clause includes client_id to prevent cross-client token theft.
 */
export async function consumeRefreshToken(
  token: string,
  clientId: string,
): Promise<RefreshToken | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `DELETE FROM oauth2_refresh_tokens
     WHERE token = $1 AND client_id = $2 AND expire > NOW()
     RETURNING *`,
    [token, clientId],
  );
  if (rows.length === 0) return null;
  return rows[0] as RefreshToken;
}

/**
 * Reuse a refresh token without rotation (confidential/web clients).
 * Extends the expiry (sliding window) and updates last_active.
 * The WHERE clause includes client_id to prevent cross-client token theft.
 */
export async function reuseRefreshToken(
  token: string,
  slidingLifetimeMs: number = 30 * 24 * 60 * 60 * 1000, // 30 days
  clientId: string,
): Promise<RefreshToken | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM oauth2_refresh_tokens WHERE token = $1 AND expire > NOW() AND client_id = $2`,
    [token, clientId],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as RefreshToken;

  // Extend expiry (sliding window) and update last_active (throttled)
  const lastActive = (row as any).last_active;
  const isStale =
    !lastActive ||
    Date.now() - new Date(lastActive).getTime() >
      LAST_ACTIVE_UPDATE_INTERVAL_S * 1000;
  if (isStale) {
    // Fire-and-forget sliding-expiry update. A failure here silently
    // shortens the refresh window (next reuse will see the old expiry),
    // so we explicitly log; do not await (hot auth path).
    pool
      .query(
        `UPDATE oauth2_refresh_tokens
         SET last_active = NOW(),
             expire = NOW() + interval '1 millisecond' * $2
         WHERE token = $1 AND client_id = $3`,
        [token, slidingLifetimeMs, clientId],
      )
      .catch((err) =>
        logger.warn(
          "failed to update oauth2_refresh_tokens sliding expiry",
          err,
        ),
      );
  }

  return row;
}

// ---- Token Stats (for admin UI) ----

export interface ClientTokenStats {
  active_access_tokens: number;
  active_refresh_tokens: number;
  last_active: Date | null;
}

export async function getClientTokenStats(
  clientId: string,
): Promise<ClientTokenStats> {
  const pool = getPool();
  const [accessResult, refreshResult, lastActiveResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) as count FROM oauth2_access_tokens
       WHERE client_id = $1 AND expire > NOW()`,
      [clientId],
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM oauth2_refresh_tokens
       WHERE client_id = $1 AND expire > NOW()`,
      [clientId],
    ),
    // Most recent last_active across both token tables
    pool.query(
      `SELECT GREATEST(
         (SELECT MAX(last_active) FROM oauth2_access_tokens WHERE client_id = $1),
         (SELECT MAX(last_active) FROM oauth2_refresh_tokens WHERE client_id = $1)
       ) as last_active`,
      [clientId],
    ),
  ]);
  return {
    active_access_tokens: parseInt(accessResult.rows[0]?.count ?? "0"),
    active_refresh_tokens: parseInt(refreshResult.rows[0]?.count ?? "0"),
    last_active: lastActiveResult.rows[0]?.last_active ?? null,
  };
}
