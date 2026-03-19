/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// OAuth2 Client Management
//
// Admin operations for creating, updating, and deleting OAuth2 clients.

import { v4 as uuidv4 } from "uuid";

import { generateRandomToken, hashSecret } from "./crypto";
import {
  createClient as dbCreateClient,
  deleteClient as dbDeleteClient,
  getClientPublic,
  getClientTokenStats,
  listClients as dbListClients,
  updateClient as dbUpdateClient,
} from "./database";
import type { ClientTokenStats } from "./database";
import type { OAuth2ClientMode, OAuth2ClientPublic } from "./types";
import { SUPPORTED_GRANT_TYPES } from "./types";

export interface CreateClientInput {
  name: string;
  description?: string;
  mode?: OAuth2ClientMode;
  redirect_uris: string[];
  scopes?: string[];
  created_by: string; // account_id of admin
}

export interface CreateClientResult {
  client_id: string;
  client_secret: string; // plain text — only shown once!
  client: OAuth2ClientPublic;
}

/**
 * Create a new OAuth2 client. Returns the client_secret in plain text.
 * The secret is hashed before storage and cannot be retrieved again.
 */
export async function createOAuth2Client(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  const clientId = uuidv4();
  const clientSecret = generateRandomToken(48);
  const secretHash = hashSecret(clientSecret);

  const mode = input.mode ?? "web";

  // Validate redirect URIs
  for (const uri of input.redirect_uris) {
    validateRedirectUri(uri, mode);
  }

  const client = {
    client_id: clientId,
    client_secret_hash: secretHash,
    name: input.name,
    description: input.description ?? "",
    mode,
    redirect_uris: input.redirect_uris,
    grant_types: [...SUPPORTED_GRANT_TYPES],
    scopes: input.scopes ?? ["openid", "profile", "email"],
    created_by: input.created_by,
    active: true,
  };

  await dbCreateClient(client);

  const pub = await getClientPublic(clientId);
  if (!pub) {
    throw new Error("Failed to create client");
  }

  return {
    client_id: clientId,
    client_secret: clientSecret,
    client: pub,
  };
}

/**
 * Validate a redirect URI based on client mode.
 * Native clients may use http://localhost or http://127.0.0.1 (RFC 8252).
 */
function validateRedirectUri(uri: string, mode: OAuth2ClientMode): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Invalid redirect URI: ${uri}`);
  }
  if (mode === "web") {
    // Allow localhost HTTP for development/CLI usage (like Google, GitHub).
    const isLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLocalhost) {
      throw new Error(
        `Web clients require HTTPS redirect URIs (localhost is also allowed). Got: ${uri}`,
      );
    }
  } else if (mode === "native") {
    const isLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol === "http:" && !isLocalhost) {
      throw new Error(
        `Native clients only allow HTTP for localhost/127.0.0.1 (got: ${uri})`,
      );
    }
  }
}

/**
 * Regenerate the client secret. Returns the new secret in plain text.
 */
export async function regenerateClientSecret(
  clientId: string,
): Promise<string> {
  const clientSecret = generateRandomToken(48);
  const secretHash = hashSecret(clientSecret);
  await dbUpdateClient(clientId, { client_secret_hash: secretHash });
  return clientSecret;
}

export { getClientPublic, dbDeleteClient as deleteOAuth2Client };
export type { ClientTokenStats };

export async function listOAuth2Clients(): Promise<OAuth2ClientPublic[]> {
  return await dbListClients();
}

/**
 * List clients with token usage stats (for admin UI).
 */
export async function listOAuth2ClientsWithStats(): Promise<
  (OAuth2ClientPublic & { stats: ClientTokenStats })[]
> {
  const clients = await dbListClients();
  const results = await Promise.all(
    clients.map(async (client) => {
      const stats = await getClientTokenStats(client.client_id);
      return { ...client, stats };
    }),
  );
  return results;
}

export async function updateOAuth2Client(
  clientId: string,
  updates: {
    name?: string;
    description?: string;
    mode?: OAuth2ClientMode;
    redirect_uris?: string[];
    scopes?: string[];
    active?: boolean;
  },
): Promise<OAuth2ClientPublic | null> {
  // Validate redirect URIs — both when URIs change and when mode changes
  const existing = await getClientPublic(clientId);
  const newMode = updates.mode ?? existing?.mode ?? "web";
  const urisToValidate = updates.redirect_uris ?? existing?.redirect_uris ?? [];
  if (updates.redirect_uris || updates.mode) {
    for (const uri of urisToValidate) {
      validateRedirectUri(uri, newMode);
    }
  }

  await dbUpdateClient(clientId, updates);
  return await getClientPublic(clientId);
}
