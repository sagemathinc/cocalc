import { Request } from "express";
import { split } from "@cocalc/util/misc";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";
import getPool from "@cocalc/database/pool";
import isBanned from "@cocalc/server/accounts/is-banned";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:auth:api");

export function getApiKey(req: Request): string {
  const h = req.header("Authorization");
  if (h == null) {
    throw Error("You must provide authentication via an API key.");
  }
  const [type, user] = split(h);
  switch (type) {
    case "Bearer":
      return user;
    case "Basic":
      return Buffer.from(user, "base64").toString().split(":")[0];
  }
  throw Error(`Unknown authorization type '${type}'`);
}

export type ApiKeyResult =
  | { account_id: string; project_id?: undefined; scope?: string }
  | { account_id?: undefined; project_id: string; scope?: undefined }
  | undefined;

// Throttle last_active writes: only update if older than 5 minutes.
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

async function getAccountFromOAuth2Token(
  token: string,
): Promise<{ account_id: string; project_id?: undefined; scope: string } | undefined> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT a.account_id, a.scope, a.last_active
     FROM oauth2_access_tokens a
     JOIN oauth2_clients c ON c.client_id = a.client_id
     WHERE a.token = $1 AND a.expire > NOW() AND c.active = true`,
    [token],
  );
  if (rows.length > 0) {
    const account_id = rows[0].account_id;
    if (await isBanned(account_id)) {
      return undefined;
    }
    // Update last_active (throttled to avoid a write on every API call)
    const lastActive = rows[0].last_active;
    if (
      !lastActive ||
      Date.now() - new Date(lastActive).getTime() > LAST_ACTIVE_THROTTLE_MS
    ) {
      // fire-and-forget; attach .catch so a DB write failure is logged
      // and cannot surface as an unhandled rejection on the auth path.
      pool
        .query(
          `UPDATE oauth2_access_tokens SET last_active = NOW() WHERE token = $1`,
          [token],
        )
        .catch((err) =>
          logger.warn(
            "failed to update oauth2_access_tokens.last_active",
            err,
          ),
        );
    }
    return { account_id, scope: rows[0].scope ?? "" };
  }
  return undefined;
}

/**
 * Look up auth from API key only (no OAuth2 fallback).
 * Used by getAccountId() for general Next.js routes where scopes
 * are NOT enforced — OAuth2 tokens must not be accepted here.
 */
export async function getAccountFromApiKeyOnly(req: Request) {
  const key = getApiKey(req);
  return await getAccountWithApiKey(key);
}

/**
 * Look up auth from API key OR OAuth2 access token.
 * Only use this in routes that enforce scopes (e.g. /api/conat/hub, /api/conat/project).
 */
export async function getAccountFromApiKey(req: Request): Promise<ApiKeyResult> {
  const key = getApiKey(req);
  const result = await getAccountWithApiKey(key);
  if (result != null) {
    // API keys have no scope restrictions
    return result;
  }
  // Fallback: check if this is an OAuth2 access token
  return await getAccountFromOAuth2Token(key);
}

/**
 * Check if the given scope string permits the requested scope.
 * If scope is undefined (API key auth), everything is allowed.
 */
export function hasScope(
  scope: string | undefined,
  required: string,
): boolean {
  if (scope == null) return true; // API keys have no scope restrictions
  const scopes = scope.split(" ");
  return scopes.includes(required);
}

/**
 * Check if scope permits access to a specific project.
 * Returns true if:
 *   - scope is undefined (API key — unrestricted)
 *   - scope contains "api:project" (all projects)
 *   - scope contains "api:project:{projectId}" (this specific project)
 */
export function hasProjectScope(
  scope: string | undefined,
  projectId: string,
): boolean {
  if (scope == null) return true;
  const scopes = scope.split(" ");
  if (scopes.includes("api:project")) return true;
  if (scopes.includes(`api:project:${projectId}`)) return true;
  return false;
}
