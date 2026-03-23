/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// OAuth2 Provider Types

// Client mode: how the OAuth2 client operates
//   "web"    — traditional web app with server-side secret exchange
//   "native" — native/local app using localhost redirect (RFC 8252)
export type OAuth2ClientMode = "web" | "native";

export interface OAuth2Client {
  // unique client identifier (UUID)
  client_id: string;
  // hashed client secret
  client_secret_hash: string;
  // human-readable name
  name: string;
  // description of the application
  description: string;
  // client mode: "web" or "native"
  mode: OAuth2ClientMode;
  // allowed redirect URIs
  redirect_uris: string[];
  // allowed grant types: "authorization_code", "refresh_token"
  grant_types: string[];
  // allowed scopes
  scopes: string[];
  // account_id of the admin who created this client
  created_by: string;
  // timestamps
  created: Date;
  modified: Date;
  // is the client active?
  active: boolean;
}

// What we return to the API (no secret hash)
export interface OAuth2ClientPublic {
  client_id: string;
  name: string;
  description: string;
  mode: OAuth2ClientMode;
  redirect_uris: string[];
  grant_types: string[];
  scopes: string[];
  created_by: string;
  created: Date;
  modified: Date;
  active: boolean;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  account_id: string;
  redirect_uri: string;
  scope: string;
  // PKCE
  code_challenge?: string;
  code_challenge_method?: string;
  device_name?: string;
  expire: Date;
}

export interface AccessToken {
  token: string;
  client_id: string;
  account_id: string;
  scope: string;
  device_name?: string;
  expire: Date;
  last_active?: Date;
}

export interface RefreshToken {
  token: string;
  client_id: string;
  account_id: string;
  scope: string;
  device_name?: string;
  expire: Date;
}

// Available scopes for the OAuth2 provider.
//
// Scope hierarchy for project access:
//   - No api:project scope  → no project API calls allowed
//   - api:project           → all projects where user is collaborator/owner
//   - api:project:{uuid}    → only the listed project(s), still requires collaborator status
//
// The api:project:{uuid} scopes are dynamic (not in this enum) — they are
// validated at runtime by checking the scope string on the access token.
export const OAUTH2_SCOPES = {
  openid: "Basic identity information",
  profile: "User profile (name, avatar)",
  email: "Email address",
  "api:read": "Read access to CoCalc API (list projects, ping, user search, read-only queries)",
  "api:write": "Write access (create projects, send messages, modify settings via db.userQuery)",
  "api:project": "Access all projects where user is collaborator",
} as const;

export type OAuth2Scope = keyof typeof OAUTH2_SCOPES;

export const SUPPORTED_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
] as const;

export const SUPPORTED_RESPONSE_TYPES = ["code"] as const;
