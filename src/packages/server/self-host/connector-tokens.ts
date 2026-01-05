import { randomBytes, randomUUID } from "crypto";
import getPool from "@cocalc/database/pool";
import passwordHash, { verifyPassword } from "@cocalc/backend/auth/password-hash";
import { isValidUUID } from "@cocalc/util/misc";

const DEFAULT_PAIRING_TTL_MS = 1000 * 60 * 30; // 30 minutes

type TokenParts = { tokenId: string; secret: string };

function pool() {
  return getPool();
}

function splitToken(token: string): TokenParts | null {
  const parts = token.split(".", 2);
  if (parts.length !== 2) return null;
  const [tokenId, secret] = parts;
  if (!tokenId || !secret) return null;
  if (!isValidUUID(tokenId)) return null;
  return { tokenId, secret };
}

export async function createPairingToken(opts: {
  account_id: string;
  ttlMs?: number;
  purpose?: string;
}): Promise<{ token: string; token_id: string; expires: Date }> {
  const token_id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const token = `${token_id}.${secret}`;
  const token_hash = passwordHash(secret);
  const purpose = opts.purpose ?? "pairing";
  const created = new Date();
  const expires = new Date(created.getTime() + (opts.ttlMs ?? DEFAULT_PAIRING_TTL_MS));
  await pool().query(
    `INSERT INTO self_host_connector_tokens
       (token_id, account_id, token_hash, purpose, created, expires, revoked)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE)`,
    [token_id, opts.account_id, token_hash, purpose, created, expires],
  );
  return { token, token_id, expires };
}

export async function verifyPairingToken(token: string, purpose = "pairing"): Promise<{
  token_id: string;
  account_id: string;
  expires: Date;
} | null> {
  const parsed = splitToken(token);
  if (!parsed) return null;
  const { tokenId, secret } = parsed;
  const { rows } = await pool().query<{
    token_hash: string;
    account_id: string;
    expires: Date;
  }>(
    `SELECT token_hash, account_id, expires
     FROM self_host_connector_tokens
     WHERE token_id=$1
       AND purpose=$2
       AND revoked IS NOT TRUE
       AND expires > NOW()`,
    [tokenId, purpose],
  );
  const row = rows[0];
  if (!row) return null;
  if (!verifyPassword(secret, row.token_hash)) return null;
  await pool().query(
    `UPDATE self_host_connector_tokens
     SET last_used=NOW()
     WHERE token_id=$1`,
    [tokenId],
  );
  return { token_id: tokenId, account_id: row.account_id, expires: row.expires };
}

export async function revokePairingToken(tokenId: string): Promise<void> {
  await pool().query(
    `UPDATE self_host_connector_tokens
     SET revoked=TRUE
     WHERE token_id=$1`,
    [tokenId],
  );
}

export async function createConnector(opts: {
  account_id: string;
  name?: string;
  metadata?: Record<string, any>;
}): Promise<{ connector_id: string; token: string }> {
  const connector_id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const token = `${connector_id}.${secret}`;
  const token_hash = passwordHash(secret);
  const created = new Date();
  await pool().query(
    `INSERT INTO self_host_connectors
       (connector_id, account_id, token_hash, name, metadata, created, last_seen, revoked)
     VALUES ($1,$2,$3,$4,$5,$6,$6,FALSE)`,
    [connector_id, opts.account_id, token_hash, opts.name ?? null, opts.metadata ?? {}, created],
  );
  return { connector_id, token };
}

export async function verifyConnectorToken(token: string): Promise<{
  connector_id: string;
  account_id: string;
  metadata: any;
} | null> {
  const parsed = splitToken(token);
  if (!parsed) return null;
  const { tokenId, secret } = parsed;
  const { rows } = await pool().query<{
    token_hash: string;
    account_id: string;
    metadata: any;
  }>(
    `SELECT token_hash, account_id, metadata
     FROM self_host_connectors
     WHERE connector_id=$1
       AND revoked IS NOT TRUE`,
    [tokenId],
  );
  const row = rows[0];
  if (!row) return null;
  if (!verifyPassword(secret, row.token_hash)) return null;
  await pool().query(
    `UPDATE self_host_connectors
     SET last_seen=NOW()
     WHERE connector_id=$1`,
    [tokenId],
  );
  return { connector_id: tokenId, account_id: row.account_id, metadata: row.metadata };
}
