import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { v4 as uuidv4 } from "uuid";

import {
  consumeAuthorizationCode,
  consumeConsentNonce,
  consumeRefreshToken,
  getAccessToken,
  getClient,
  createClient,
  deleteClient,
  reuseRefreshToken,
  revokeAccessToken,
  revokeRefreshToken,
  saveAccessToken,
  saveAuthorizationCode,
  saveConsentNonce,
  saveRefreshToken,
} from "./database";
import { hashSecret } from "./crypto";

const HAVE_DB = process.env.PGDATABASE === "smc_ephemeral_testing_database";
const D = HAVE_DB ? describe : describe.skip;

beforeAll(async () => {
  if (!HAVE_DB) return;
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  if (!HAVE_DB) return;
  await getPool().end();
});

const TEST_ACCOUNT_ID = uuidv4();
const TEST_CLIENT_ID = uuidv4();

D("oauth2 clients", () => {
  it("creates a client", async () => {
    await createClient({
      client_id: TEST_CLIENT_ID,
      client_secret_hash: hashSecret("test-secret"),
      name: "Test Client",
      description: "For testing",
      mode: "native",
      redirect_uris: ["http://localhost/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      scopes: ["openid", "profile"],
      created_by: TEST_ACCOUNT_ID,
      active: true,
    });
    const client = await getClient(TEST_CLIENT_ID);
    expect(client).not.toBeNull();
    expect(client!.name).toBe("Test Client");
    expect(client!.mode).toBe("native");
    expect(client!.active).toBe(true);
  });

  it("deletes a client and its tokens", async () => {
    const cid = uuidv4();
    await createClient({
      client_id: cid,
      client_secret_hash: hashSecret("s"),
      name: "Temp",
      description: "",
      mode: "web",
      redirect_uris: ["https://example.com/cb"],
      grant_types: ["authorization_code"],
      scopes: ["openid"],
      created_by: TEST_ACCOUNT_ID,
      active: true,
    });
    await deleteClient(cid);
    expect(await getClient(cid)).toBeNull();
  });
});

D("authorization codes", () => {
  it("saves and consumes a code (single use)", async () => {
    const code = "test-code-" + uuidv4();
    await saveAuthorizationCode({
      code,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      redirect_uri: "http://localhost/callback",
      scope: "openid profile",
      expire: new Date(Date.now() + 600_000),
    });

    const result = await consumeAuthorizationCode(code);
    expect(result).not.toBeNull();
    expect(result!.account_id).toBe(TEST_ACCOUNT_ID);

    // Second consume should return null (single use)
    const result2 = await consumeAuthorizationCode(code);
    expect(result2).toBeNull();
  });

  // Note: consumeAuthorizationCode doesn't check expire — that's done
  // by the provider after consuming. The maintenance job cleans up expired codes.
});

D("access tokens", () => {
  const tokenStr = "access-" + uuidv4();

  it("saves and retrieves", async () => {
    await saveAccessToken({
      token: tokenStr,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid profile",
      expire: new Date(Date.now() + 3600_000),
    });

    const token = await getAccessToken(tokenStr);
    expect(token).not.toBeNull();
    expect(token!.account_id).toBe(TEST_ACCOUNT_ID);
    expect(token!.scope).toBe("openid profile");
  });

  it("rejects expired token", async () => {
    const expired = "expired-access-" + uuidv4();
    await saveAccessToken({
      token: expired,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid",
      expire: new Date(Date.now() - 1000),
    });
    expect(await getAccessToken(expired)).toBeNull();
  });

  it("revokes a token", async () => {
    await revokeAccessToken(tokenStr, TEST_CLIENT_ID);
    expect(await getAccessToken(tokenStr)).toBeNull();
  });
});

D("refresh tokens", () => {
  it("consume atomically deletes (single-use)", async () => {
    const tokenStr = "refresh-" + uuidv4();
    await saveRefreshToken({
      token: tokenStr,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid",
      expire: new Date(Date.now() + 30 * 24 * 3600_000),
    });

    const result = await consumeRefreshToken(tokenStr, TEST_CLIENT_ID);
    expect(result).not.toBeNull();
    expect(result!.account_id).toBe(TEST_ACCOUNT_ID);

    // Second consume should return null (single-use, token deleted)
    const result2 = await consumeRefreshToken(tokenStr, TEST_CLIENT_ID);
    expect(result2).toBeNull();
  });

  it("consume rejects wrong client_id", async () => {
    const tokenStr = "refresh-wrong-client-" + uuidv4();
    await saveRefreshToken({
      token: tokenStr,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid",
      expire: new Date(Date.now() + 30 * 24 * 3600_000),
    });

    const wrongClient = uuidv4();
    const result = await consumeRefreshToken(tokenStr, wrongClient);
    expect(result).toBeNull();
  });

  it("reuse returns token data (confidential clients)", async () => {
    const tokenStr = "reuse-" + uuidv4();
    await saveRefreshToken({
      token: tokenStr,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid",
      expire: new Date(Date.now() + 3600_000),
    });

    const result = await reuseRefreshToken(tokenStr, undefined, TEST_CLIENT_ID);
    expect(result).not.toBeNull();
    expect(result!.account_id).toBe(TEST_ACCOUNT_ID);

    // Can be reused again (not consumed)
    const result2 = await reuseRefreshToken(tokenStr, undefined, TEST_CLIENT_ID);
    expect(result2).not.toBeNull();
  });

  it("reuse rejects wrong client_id", async () => {
    const tokenStr = "reuse-wrong-client-" + uuidv4();
    await saveRefreshToken({
      token: tokenStr,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid",
      expire: new Date(Date.now() + 3600_000),
    });

    const wrongClient = uuidv4();
    const result = await reuseRefreshToken(tokenStr, undefined, wrongClient);
    expect(result).toBeNull();
  });

  it("revokes a refresh token", async () => {
    const tokenStr = "revoke-refresh-" + uuidv4();
    await saveRefreshToken({
      token: tokenStr,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      scope: "openid",
      expire: new Date(Date.now() + 3600_000),
    });
    await revokeRefreshToken(tokenStr, TEST_CLIENT_ID);
    const result = await consumeRefreshToken(tokenStr, TEST_CLIENT_ID);
    expect(result).toBeNull();
  });
});

D("consent nonces", () => {
  it("save and consume a consent nonce", async () => {
    const nonce = "nonce-" + uuidv4();
    await saveConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);

    const ok = await consumeConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);
    expect(ok).toBe(true);

    // Second consume should fail (single-use)
    const ok2 = await consumeConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);
    expect(ok2).toBe(false);
  });

  it("rejects nonce with wrong client_id", async () => {
    const nonce = "nonce-wrong-client-" + uuidv4();
    await saveConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);

    const wrongClient = uuidv4();
    const ok = await consumeConsentNonce(nonce, wrongClient, TEST_ACCOUNT_ID);
    expect(ok).toBe(false);
  });

  it("rejects nonce with wrong account_id", async () => {
    const nonce = "nonce-wrong-account-" + uuidv4();
    await saveConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);

    const wrongAccount = uuidv4();
    const ok = await consumeConsentNonce(nonce, TEST_CLIENT_ID, wrongAccount);
    expect(ok).toBe(false);
  });

  it("does not interfere with authorization codes", async () => {
    // Save a consent nonce and an auth code with different values
    const nonce = "nonce-no-interfere-" + uuidv4();
    const code = "code-no-interfere-" + uuidv4();

    await saveConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);
    await saveAuthorizationCode({
      code,
      client_id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      redirect_uri: "http://localhost/callback",
      scope: "openid",
      expire: new Date(Date.now() + 600_000),
    });

    // Consuming the auth code should work (type='code')
    const authResult = await consumeAuthorizationCode(code);
    expect(authResult).not.toBeNull();

    // Consuming the nonce should also work (type='consent_nonce')
    const nonceOk = await consumeConsentNonce(nonce, TEST_CLIENT_ID, TEST_ACCOUNT_ID);
    expect(nonceOk).toBe(true);
  });
});
