/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Database schema for the OAuth2 Provider tables.
// These tables enable CoCalc to act as an OAuth2 authorization server.

import { Table } from "./types";

Table({
  name: "oauth2_clients",
  fields: {
    client_id: {
      type: "uuid",
      desc: "Unique identifier for this OAuth2 client application.",
    },
    client_secret_hash: {
      type: "string",
      desc: "SHA-256 hash of the client secret.",
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(256)",
      desc: "Human-readable name of the client application.",
    },
    description: {
      type: "string",
      desc: "Description of the client application.",
    },
    mode: {
      type: "string",
      pg_type: "VARCHAR(10)",
      desc: 'Client mode: "web" for server-side apps, "native" for local/desktop apps using localhost redirects (RFC 8252).',
    },
    redirect_uris: {
      type: "map",
      desc: "JSON array of allowed redirect URIs.",
    },
    grant_types: {
      type: "map",
      desc: 'JSON array of allowed grant types (e.g. ["authorization_code","refresh_token"]).',
    },
    scopes: {
      type: "map",
      desc: 'JSON array of allowed scopes (e.g. ["openid","profile","email"]).',
    },
    created_by: {
      type: "uuid",
      desc: "The account_id of the admin who registered this client.",
    },
    created: {
      type: "timestamp",
      desc: "When this client was registered.",
    },
    modified: {
      type: "timestamp",
      desc: "When this client was last modified.",
    },
    active: {
      type: "boolean",
      desc: "Whether this client is currently active.",
    },
  },
  rules: {
    primary_key: "client_id",
    pg_indexes: ["created_by"],
  },
});

Table({
  name: "oauth2_authorization_codes",
  fields: {
    code: {
      type: "string",
      desc: "The authorization code (opaque token).",
    },
    client_id: {
      type: "uuid",
      desc: "The client this code was issued to.",
    },
    account_id: {
      type: "uuid",
      desc: "The user who authorized the client.",
    },
    redirect_uri: {
      type: "string",
      desc: "The redirect URI used in the authorization request.",
    },
    scope: {
      type: "string",
      desc: "Space-separated list of granted scopes.",
    },
    code_challenge: {
      type: "string",
      desc: "PKCE code challenge (RFC 7636).",
    },
    code_challenge_method: {
      type: "string",
      pg_type: "VARCHAR(10)",
      desc: "PKCE code challenge method (S256 or plain).",
    },
    device_name: {
      type: "string",
      pg_type: "VARCHAR(256)",
      desc: "User-provided name for the device/session (e.g. hostname).",
    },
    type: {
      type: "string",
      pg_type: "VARCHAR(20) DEFAULT 'code'",
      desc: "Row type: 'code' for authorization codes, 'consent_nonce' for CSRF consent tokens.",
    },
    expire: {
      type: "timestamp",
      desc: "When this authorization code expires.",
    },
  },
  rules: {
    primary_key: "code",
    pg_indexes: ["expire"],
  },
});

Table({
  name: "oauth2_access_tokens",
  fields: {
    token: {
      type: "string",
      desc: "The access token (opaque Bearer token).",
    },
    client_id: {
      type: "uuid",
      desc: "The client this token was issued to.",
    },
    account_id: {
      type: "uuid",
      desc: "The user this token represents.",
    },
    scope: {
      type: "string",
      desc: "Space-separated list of granted scopes.",
    },
    device_name: {
      type: "string",
      pg_type: "VARCHAR(256)",
      desc: "User-provided name for the device/session (e.g. hostname).",
    },
    expire: {
      type: "timestamp",
      desc: "When this access token expires (1 hour lifetime).",
    },
    last_active: {
      type: "timestamp",
      desc: "When this access token was last used.",
    },
  },
  rules: {
    primary_key: "token",
    pg_indexes: ["expire", "account_id", "client_id"],
  },
});

Table({
  name: "oauth2_refresh_tokens",
  fields: {
    token: {
      type: "string",
      desc: "The refresh token (opaque token).",
    },
    client_id: {
      type: "uuid",
      desc: "The client this token was issued to.",
    },
    account_id: {
      type: "uuid",
      desc: "The user this token represents.",
    },
    scope: {
      type: "string",
      desc: "Space-separated list of granted scopes.",
    },
    device_name: {
      type: "string",
      pg_type: "VARCHAR(256)",
      desc: "User-provided name for the device/session (e.g. hostname).",
    },
    expire: {
      type: "timestamp",
      desc: "When this refresh token expires.",
    },
    last_active: {
      type: "timestamp",
      desc: "When this refresh token was last used (set on creation/rotation).",
    },
  },
  rules: {
    primary_key: "token",
    pg_indexes: ["expire", "client_id"],
  },
});
