/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// OAuth2 Provider Express Router
//
// Implements the core OAuth2 authorization code flow (RFC 6749)
// with PKCE support (RFC 7636) and server metadata (RFC 8414).
//
// This is an OAuth2 authorization server — NOT a full OpenID Connect
// provider.  We do not issue id_tokens or sign JWTs.  The /oauth/userinfo
// endpoint is a convenience identity endpoint (similar to GitHub/GitLab).
//
// Endpoints:
//   GET  /oauth/authorize     - Authorization endpoint
//   POST /oauth/token         - Token endpoint
//   GET  /oauth/userinfo      - Identity endpoint (Bearer token)
//   POST /oauth/revoke        - Token revocation (RFC 7009)
//   GET  /.well-known/oauth-authorization-server - RFC 8414 metadata

import { getLogger } from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import express from "express";

import { isValidUUID } from "@cocalc/util/misc";
import { renderConsentPage } from "./consent-page";
import {
  generateRandomToken,
  hashSecret,
  verifyCodeChallenge,
  verifySecret,
} from "./crypto";
import { matchRedirectUri } from "./redirect-uri";
import { rateLimit } from "./rate-limit";
import {
  consumeAuthorizationCode,
  consumeConsentNonce,
  consumeRefreshToken,
  getAccessToken,
  getClient,
  reuseRefreshToken,
  revokeAccessToken,
  revokeRefreshToken,
  saveAccessToken,
  saveAuthorizationCode,
  saveConsentNonce,
  saveRefreshToken,
} from "./database";
import { OAUTH2_SCOPES, SUPPORTED_RESPONSE_TYPES } from "./types";
import type { OAuth2Client } from "./types";

const logger = getLogger("auth:oauth2-provider");

// Token lifetimes (industry standard)
const AUTHORIZATION_CODE_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (sliding)

interface ProviderOptions {
  // The issuer URL, e.g. "https://cocalc.com"
  issuer: string;
  // Base path, e.g. "/auth" — the router is mounted here
  basePath?: string;
  // Function to get the current user's account_id from the request
  // (using the existing CoCalc session cookie).
  // Returns null if not authenticated.
  getAccountId: (req: express.Request) => Promise<string | null>;
  // URL of the sign-in page to redirect to if not authenticated
  signInUrl: string;
  // Default native client_id for CLI tools (advertised in server metadata)
  nativeClientId?: string;
}

/**
 * Create the OAuth2 provider Express router.
 *
 * This router handles the OAuth2 authorization code flow:
 * 1. Client redirects user to GET /oauth/authorize
 * 2. User authenticates (via existing CoCalc session)
 * 3. User approves the authorization request (consent)
 * 4. Server redirects back to client with authorization code
 * 5. Client exchanges code for tokens via POST /oauth/token
 * 6. Client uses access token to call GET /oauth/userinfo
 */
export function createOAuth2Provider(opts: ProviderOptions): express.Router {
  const router = express.Router();
  const { issuer, basePath = "", getAccountId, signInUrl, nativeClientId } = opts;

  // Parse URL-encoded bodies for the token endpoint
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  // ========================================
  // OAuth2 Authorization Server Metadata (RFC 8414)
  // ========================================
  //
  // This is a lightweight OAuth2 authorization server for API access and
  // CLI auth.  We publish RFC 8414 metadata so clients can auto-discover
  // endpoints.  We intentionally do NOT issue id_tokens (JWTs) and do
  // NOT claim OpenID Connect compliance.
  //
  // The `openid` scope is accepted (clients may request it) and controls
  // what the /oauth/userinfo identity endpoint returns, but no id_token
  // is ever included in token responses.
  //
  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    const base = `${issuer}${basePath}`;
    const doc: Record<string, any> = {
      issuer,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      revocation_endpoint: `${base}/oauth/revoke`,
      scopes_supported: Object.keys(OAUTH2_SCOPES),
      response_types_supported: [...SUPPORTED_RESPONSE_TYPES],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      code_challenge_methods_supported: ["S256"],
      // Non-standard convenience identity endpoint (like GitHub/GitLab).
      // Not part of core OAuth2 but universally expected by clients.
      userinfo_endpoint: `${base}/oauth/userinfo`,
    };
    // Custom extension: default native client for CLI tools
    if (nativeClientId) {
      doc.native_client_id = nativeClientId;
    }
    res.json(doc);
  });

  // ========================================
  // Authorization Endpoint
  // GET  → validate params, show consent screen
  // POST → user approved, issue code and redirect
  // ========================================

  /** Validate authorization request params. Returns validated data or sends error response. */
  async function validateAuthRequest(
    req: express.Request,
    res: express.Response,
  ) {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      device_name,
    } = { ...req.query, ...req.body } as Record<string, string>;

    if (!response_type || !client_id || !redirect_uri) {
      res.status(400).json({
        error: "invalid_request",
        error_description:
          "Missing required parameters: response_type, client_id, redirect_uri",
      });
      return null;
    }

    if (response_type !== "code") {
      res.status(400).json({
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      });
      return null;
    }

    const client = await getClient(client_id);
    if (!client || !client.active) {
      res.status(400).json({
        error: "invalid_client",
        error_description: "Unknown or inactive client",
      });
      return null;
    }

    if (!matchRedirectUri(redirect_uri, client.redirect_uris)) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Invalid redirect_uri",
      });
      return null;
    }

    const requestedScopes = scope ? scope.split(" ") : ["openid"];
    const validScopes = Object.keys(OAUTH2_SCOPES);
    for (const s of requestedScopes) {
      // Check global validity
      const isGloballyValid =
        validScopes.includes(s) ||
        (s.startsWith("api:project:") &&
          isValidUUID(s.slice("api:project:".length)));
      if (!isGloballyValid) {
        redirectWithError(res, redirect_uri, "invalid_scope", state);
        return null;
      }
      // Check client's registered scope allowlist
      const clientAllows =
        client.scopes.includes(s) ||
        (s.startsWith("api:project:") && client.scopes.includes("api:project"));
      if (!clientAllows) {
        redirectWithError(res, redirect_uri, "invalid_scope", state);
        return null;
      }
    }

    // Only S256 PKCE is supported (plain is insecure)
    if (code_challenge_method && code_challenge_method !== "S256") {
      res.status(400).json({
        error: "invalid_request",
        error_description:
          "Unsupported code_challenge_method — only S256 is supported",
      });
      return null;
    }

    // Native (public) clients MUST bind the authorization request to a
    // PKCE challenge here.  If we only enforce code_verifier at the
    // token step without requiring the challenge was stored, a native
    // client could skip PKCE at /authorize and later send any random
    // verifier at /token — defeating the PKCE guarantee.
    if (client.mode === "native") {
      if (!code_challenge) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Native clients must include code_challenge (PKCE)",
        });
        return null;
      }
      // code_challenge_method defaults to "plain" in the RFC; we require
      // it to be explicitly S256 so the verifier check below is meaningful.
      if (code_challenge_method && code_challenge_method !== "S256") {
        // Already handled above, but keep for clarity.
        return null;
      }
      if (!code_challenge_method) {
        res.status(400).json({
          error: "invalid_request",
          error_description:
            "Native clients must set code_challenge_method=S256 (PKCE)",
        });
        return null;
      }
    }

    const accountId = await getAccountId(req);
    if (!accountId) {
      const params = { ...req.query, ...req.body } as Record<string, string>;
      const returnUrl = `${basePath}/oauth/authorize?${new URLSearchParams(params).toString()}`;
      res.redirect(
        `${signInUrl}?${new URLSearchParams({ next: returnUrl }).toString()}`,
      );
      return null;
    }

    return {
      client,
      client_id,
      redirect_uri,
      state,
      requestedScopes,
      code_challenge,
      code_challenge_method,
      device_name,
      accountId,
    };
  }

  // GET: Show consent screen (generates a CSRF nonce)
  router.get("/oauth/authorize", async (req, res) => {
    try {
      const validated = await validateAuthRequest(req, res);
      if (!validated) return;

      const { client, client_id, requestedScopes, device_name, accountId } =
        validated;

      // Generate consent nonce (CSRF protection for the POST)
      const consentNonce = generateRandomToken();
      await saveConsentNonce(consentNonce, client_id, accountId);

      res.type("html").send(
        renderConsentPage({
          clientName: client.name,
          clientDescription: client.description,
          clientMode: client.mode ?? "web",
          requestedScopes,
          queryParams: req.query as Record<string, string>,
          deviceName: device_name || "",
          basePath,
          consentNonce,
        }),
      );
    } catch (err) {
      logger.error("authorization endpoint error", err);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error",
      });
    }
  });

  // POST: Process consent (approve or deny)
  // Requires a valid consent_nonce from the GET-rendered form (CSRF protection).
  router.post("/oauth/authorize", async (req, res) => {
    try {
      const validated = await validateAuthRequest(req, res);
      if (!validated) return;

      const {
        client_id,
        redirect_uri,
        state,
        requestedScopes,
        code_challenge,
        code_challenge_method,
        device_name,
        accountId,
      } = validated;

      // Verify consent nonce (CSRF protection)
      const { consent_nonce } = req.body;
      if (!consent_nonce) {
        res.status(403).json({
          error: "invalid_request",
          error_description: "Missing consent nonce",
        });
        return;
      }
      const nonceValid = await consumeConsentNonce(
        consent_nonce,
        client_id,
        accountId,
      );
      if (!nonceValid) {
        res.status(403).json({
          error: "invalid_request",
          error_description:
            "Invalid or expired consent nonce — please try again",
        });
        return;
      }

      // Check if user denied
      if (req.body.deny) {
        redirectWithError(res, redirect_uri, "access_denied", state);
        return;
      }

      // Issue authorization code
      const code = generateRandomToken();
      const authCode = {
        code,
        client_id,
        account_id: accountId,
        redirect_uri,
        scope: requestedScopes.join(" "),
        code_challenge: code_challenge ?? undefined,
        code_challenge_method: code_challenge_method ?? undefined,
        device_name: device_name ?? undefined,
        expire: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME_MS),
      };

      await saveAuthorizationCode(authCode);
      logger.info("authorization code issued", {
        client_id,
        account_id: accountId,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", code);
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }
      res.redirect(redirectUrl.toString());
    } catch (err) {
      logger.error("authorization POST error", err);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error",
      });
    }
  });

  // ========================================
  // Token Endpoint (POST)
  // ========================================
  router.post("/oauth/token", async (req, res) => {
    try {
      // RFC 6749 §5.1 — token responses MUST include Cache-Control: no-store.
      // Set it once on entry so every response from this handler is covered,
      // including rate-limit, validation, and server-error paths.
      setNoStore(res);
      const { grant_type, client_id } = req.body;

      // Rate limit: 2/s per (client_id, IP), 10/s global. Keying by IP
      // as well prevents a caller spoofing a known client_id from
      // exhausting that client's legitimate quota.
      const ip = req.ip ?? "unknown";
      const rateLimitError = rateLimit(client_id ?? "unknown", ip);
      if (rateLimitError) {
        res.status(429).json({
          error: "rate_limit_exceeded",
          error_description: rateLimitError,
        });
        return;
      }

      if (grant_type === "authorization_code") {
        await handleAuthorizationCodeGrant(req, res);
      } else if (grant_type === "refresh_token") {
        await handleRefreshTokenGrant(req, res);
      } else {
        res.status(400).json({
          error: "unsupported_grant_type",
          error_description:
            "Supported grant types: authorization_code, refresh_token",
        });
      }
    } catch (err) {
      logger.error("token endpoint error", err);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error",
      });
    }
  });

  async function handleAuthorizationCodeGrant(
    req: express.Request,
    res: express.Response,
  ) {
    const { code, client_id, client_secret, redirect_uri, code_verifier } =
      req.body;

    if (!code || !client_id || !redirect_uri) {
      res.status(400).json({
        error: "invalid_request",
        error_description:
          "Missing required parameters: code, client_id, redirect_uri",
      });
      return;
    }

    // Authenticate client.  authenticateClientOrReject runs exactly one
    // verifySecret call (against a dummy hash if the client record is
    // missing) so unknown-client, inactive-client, missing-secret, and
    // wrong-secret are all indistinguishable in response body AND timing.
    // Confidential (web) clients MUST authenticate per RFC 6749 §3.2.1;
    // PKCE is additive, not a substitute.
    const client = await getClient(client_id);
    if (!authenticateClientOrReject(res, client, client_secret)) return;

    // Consume the authorization code (single use). The DELETE is
    // scoped to client_id, so a code issued to a different client
    // will not match and will not be consumed here (prevents a
    // third party from burning another client's code).
    const authCode = await consumeAuthorizationCode(code, client_id);
    if (!authCode) {
      res.status(400).json({
        error: "invalid_grant",
        error_description:
          "Invalid or expired authorization code, or not issued to this client",
      });
      return;
    }

    // Verify redirect_uri matches (RFC 8252: localhost port is ignored)
    if (
      authCode.redirect_uri !== redirect_uri &&
      !matchRedirectUri(redirect_uri, [authCode.redirect_uri])
    ) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "redirect_uri mismatch",
      });
      return;
    }

    // Expiry is checked in the DB query (consumeAuthorizationCode uses
    // WHERE expire > NOW()), so if we get here the code is still valid.

    // Native clients MUST always use PKCE. Enforced at /authorize
    // (validateAuthRequest refuses to issue a code without
    // code_challenge), but we also fail closed here: if a native
    // client's stored authCode somehow lacks a challenge, reject.
    // This defends against a validation regression at /authorize and
    // against any future code path that bypasses validateAuthRequest.
    if (client.mode === "native") {
      if (!code_verifier) {
        res.status(400).json({
          error: "invalid_grant",
          error_description:
            "Native clients must use PKCE (code_verifier required)",
        });
        return;
      }
      if (!authCode.code_challenge) {
        logger.error(
          "native authorization code missing code_challenge — refusing to redeem",
          { client_id },
        );
        res.status(400).json({
          error: "invalid_grant",
          error_description:
            "Native client authorization code missing PKCE challenge",
        });
        return;
      }
    }

    // Verify PKCE if code_challenge was set.
    // By this point the client is authenticated (web: client_secret above,
    // native: PKCE required by the previous guard), so a missing
    // code_challenge on a web client is acceptable — client_secret alone
    // is sufficient authentication per RFC 6749 §3.2.1.
    if (authCode.code_challenge) {
      if (!code_verifier) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "code_verifier is required (PKCE)",
        });
        return;
      }
      if (
        !verifyCodeChallenge(
          code_verifier,
          authCode.code_challenge,
          authCode.code_challenge_method ?? "S256",
        )
      ) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid code_verifier",
        });
        return;
      }
    }

    // Issue tokens
    const accessTokenStr = generateRandomToken();
    const refreshTokenStr = generateRandomToken();

    const accessToken = {
      token: accessTokenStr,
      client_id,
      account_id: authCode.account_id,
      scope: authCode.scope,
      device_name: authCode.device_name,
      expire: new Date(Date.now() + ACCESS_TOKEN_LIFETIME_MS),
    };

    const refreshToken = {
      token: refreshTokenStr,
      client_id,
      account_id: authCode.account_id,
      scope: authCode.scope,
      device_name: authCode.device_name,
      expire: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
    };

    await saveAccessToken(accessToken);
    if (client.grant_types.includes("refresh_token")) {
      await saveRefreshToken(refreshToken);
    }

    logger.info("tokens issued", {
      client_id,
      account_id: authCode.account_id,
    });

    // NOTE: We do not include an id_token — this is an OAuth2 server, not
    // an OIDC provider.  Clients use GET /oauth/userinfo for identity.
    const response: Record<string, any> = {
      access_token: accessTokenStr,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
      scope: authCode.scope,
    };

    if (client.grant_types.includes("refresh_token")) {
      response.refresh_token = refreshTokenStr;
    }

    res.json(response);
  }

  async function handleRefreshTokenGrant(
    req: express.Request,
    res: express.Response,
  ) {
    const { refresh_token, client_id, client_secret } = req.body;

    if (!refresh_token || !client_id) {
      res.status(400).json({
        error: "invalid_request",
        error_description:
          "Missing required parameters: refresh_token, client_id",
      });
      return;
    }

    // Authenticate client via the shared helper so every failure path
    // (unknown, inactive, missing secret, wrong secret) is indistinguishable
    // in body AND timing.
    const client = await getClient(client_id);
    if (!authenticateClientOrReject(res, client, client_secret)) return;

    const isConfidential = client.mode === "web";

    // Confidential web clients with a valid client_secret: reuse the
    // refresh token (no rotation). This is safe because the secret
    // proves the caller's identity and avoids the lost-response problem.
    //
    // Native/public clients: rotate the refresh token. The old token
    // is atomically deleted (single-use) to prevent replay attacks.
    // If the client loses the response, it must re-authenticate.

    // Both DB calls filter by client_id, so a token belonging to a
    // different client will simply not match (returns null).
    let oldRefresh;
    if (isConfidential) {
      oldRefresh = await reuseRefreshToken(refresh_token, REFRESH_TOKEN_LIFETIME_MS, client_id);
    } else {
      oldRefresh = await consumeRefreshToken(refresh_token, client_id);
    }

    if (!oldRefresh) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired refresh token",
      });
      return;
    }

    // Issue new access token
    const accessTokenStr = generateRandomToken();
    await saveAccessToken({
      token: accessTokenStr,
      client_id,
      account_id: oldRefresh.account_id,
      scope: oldRefresh.scope,
      device_name: (oldRefresh as any).device_name,
      expire: new Date(Date.now() + ACCESS_TOKEN_LIFETIME_MS),
    });

    const response: Record<string, any> = {
      access_token: accessTokenStr,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
      scope: oldRefresh.scope,
    };

    if (isConfidential) {
      // Reuse: return the same refresh token
      response.refresh_token = refresh_token;
    } else {
      // Rotation: issue a new refresh token
      const refreshTokenStr = generateRandomToken();
      await saveRefreshToken({
        token: refreshTokenStr,
        client_id,
        account_id: oldRefresh.account_id,
        scope: oldRefresh.scope,
        device_name: (oldRefresh as any).device_name,
        expire: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
      });
      response.refresh_token = refreshTokenStr;
    }

    logger.info("tokens refreshed", {
      client_id,
      account_id: oldRefresh.account_id,
      rotated: !isConfidential,
    });

    res.json(response);
  }

  // ========================================
  // UserInfo Endpoint (GET/POST)
  // ========================================
  router.get("/oauth/userinfo", handleUserInfo);
  router.post("/oauth/userinfo", handleUserInfo);

  async function handleUserInfo(req: express.Request, res: express.Response) {
    try {
      // RFC 6749 §5.1 — never cache identity responses.
      setNoStore(res);
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          error: "invalid_token",
          error_description: "Bearer token required",
        });
        return;
      }

      const tokenStr = authHeader.slice(7);
      const token = await getAccessToken(tokenStr);
      if (!token) {
        res.status(401).json({
          error: "invalid_token",
          error_description: "Invalid or expired access token",
        });
        return;
      }

      // Verify the issuing client is still active
      const tokenClient = await getClient(token.client_id);
      if (!tokenClient?.active) {
        res.status(401).json({
          error: "invalid_token",
          error_description: "Client has been deactivated",
        });
        return;
      }

      // Fetch user info from the accounts table — including the banned
      // flag, so a user banned after token issuance can no longer use
      // this token to retrieve identity.  (Matches the banned check in
      // getAccountFromOAuth2Token at the API boundary.)
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT account_id, first_name, last_name, email_address,
                email_address_verified, banned, created
         FROM accounts WHERE account_id = $1`,
        [token.account_id],
      );

      if (rows.length === 0) {
        res.status(404).json({
          error: "invalid_token",
          error_description: "Account not found",
        });
        return;
      }

      const account = rows[0];
      if (account.banned) {
        res.status(401).json({
          error: "invalid_token",
          error_description: "Account has been banned",
        });
        return;
      }
      const scopes = token.scope.split(" ");
      const userInfo: Record<string, any> = {
        sub: account.account_id,
      };

      // When only `openid` is granted, return just `sub`.
      // Profile and email claims require their respective scopes.
      if (scopes.includes("profile")) {
        userInfo.name =
          `${account.first_name ?? ""} ${account.last_name ?? ""}`.trim();
        userInfo.given_name = account.first_name ?? "";
        userInfo.family_name = account.last_name ?? "";
      }

      if (scopes.includes("email")) {
        userInfo.email = account.email_address;
        userInfo.email_verified = !!account.email_address_verified;
      }

      res.json(userInfo);
    } catch (err) {
      logger.error("userinfo endpoint error", err);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error",
      });
    }
  }

  // ========================================
  // Token Revocation (POST) — RFC 7009
  // ========================================
  router.post("/oauth/revoke", async (req, res) => {
    try {
      const { token, client_id, client_secret } = req.body;
      if (!token || !client_id) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters: token, client_id",
        });
        return;
      }

      // RFC 7009 §2.1 requires identifying the client; confidential
      // clients MUST authenticate per RFC 6749 §2.3.1.  Without this,
      // anyone who learns a token plus the (public) client_id could
      // invoke a denial-of-service by revoking it.  The shared helper
      // equalizes body AND timing across unknown-client, inactive,
      // missing-secret, and wrong-secret cases.  Native clients may
      // revoke without a secret (public-client model), but a provided-
      // but-wrong secret is rejected for consistency with /token.
      const client = await getClient(client_id);
      if (!authenticateClientOrReject(res, client, client_secret)) return;

      // Try revoking as both access and refresh token, scoped to this
      // client_id.  Per RFC 7009 revocation always returns 200 — we
      // do not reveal whether the token existed or belonged to the client.
      await revokeAccessToken(token, client_id);
      await revokeRefreshToken(token, client_id);
      res.status(200).json({});
    } catch (err) {
      logger.error("revoke endpoint error", err);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error",
      });
    }
  });

  return router;
}

function redirectWithError(
  res: express.Response,
  redirectUri: string,
  error: string,
  state?: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
}

/** RFC 6749 §5.1 — token responses MUST NOT be cached. */
function setNoStore(res: express.Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

// Uniform message for every client-authentication failure at the
// token/refresh/revoke endpoints.  Using the same text for
// unknown-client, inactive-client, missing-secret, and wrong-secret
// prevents an attacker from enumerating valid client_ids or learning
// whether a given client is confidential vs. native.
const INVALID_CLIENT_MESSAGE = "Invalid client authentication";

// Sentinel hash used to equalize verifySecret cost when the client
// record is absent. The plaintext value does not matter; it only needs
// to produce a stable SHA-256 digest so verifySecret does the same
// amount of work as it does against a real client_secret_hash.
const DUMMY_CLIENT_SECRET_HASH = hashSecret(
  "oauth2-provider-timing-equalization-sentinel",
);

function sendInvalidClient(res: express.Response) {
  res.status(401).json({
    error: "invalid_client",
    error_description: INVALID_CLIENT_MESSAGE,
  });
}

/**
 * Authenticate the client for a /token or /revoke request and send an
 * invalid_client response if authentication fails.  Returns true iff the
 * client is known, active, and (for web clients) presented a valid
 * secret; otherwise returns false after sending the 401.
 *
 * Always runs exactly one verifySecret call — against a dummy hash when
 * the client record is missing — so response timing cannot be used to
 * enumerate valid client_ids or to distinguish unknown-client from
 * wrong-secret.  For native clients we treat an omitted secret as
 * acceptable (public clients) but reject a provided-but-wrong secret,
 * consistent with the /token code path.
 */
function authenticateClientOrReject(
  res: express.Response,
  client: OAuth2Client | null,
  submittedSecret: string | undefined,
): client is OAuth2Client {
  const targetHash = client?.client_secret_hash ?? DUMMY_CLIENT_SECRET_HASH;
  const secretOk = verifySecret(submittedSecret ?? "", targetHash);

  if (!client || !client.active) {
    sendInvalidClient(res);
    return false;
  }
  if (client.mode === "web") {
    if (!submittedSecret || !secretOk) {
      sendInvalidClient(res);
      return false;
    }
  } else if (submittedSecret != null && !secretOk) {
    // Native/public client offered a secret but it does not match.
    sendInvalidClient(res);
    return false;
  }
  return true;
}
