import { timingSafeEqual } from "node:crypto";
import { secureRandomString } from "@cocalc/backend/misc";
import passwordHash from "@cocalc/backend/auth/password-hash";

const AUTH_COOKIE_NAME = "cocalc-lite-auth";
const NINETY_DAYS_SECS = 90 * 24 * 60 * 60;

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.split("=");
    if (!k) continue;
    out[k.trim()] = decodeURIComponent((rest.join("=") || "").trim());
  }
  return out;
}

function safeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // timingSafeEqual throws if buffer lengths differ
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function getAuthCookieValue(AUTH_TOKEN?: string) {
  if (!AUTH_TOKEN) {
    return "";
  }
  return passwordHash(AUTH_TOKEN);
}

function makeAuthCookie(secure: boolean, AUTH_COOKIE_VALUE: string): string {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(AUTH_COOKIE_VALUE)}`,
    "Path=/",
    `Max-Age=${NINETY_DAYS_SECS}`,
    "HttpOnly",
    secure ? "Secure" : "", // in practice always true for you
    "SameSite=Lax",
  ].filter(Boolean);
  return attrs.join("; ");
}

/** remove ?auth_token=... from a path+query without knowing full origin */
function stripAuthTokenFromUrlPath(originalPath: string): string {
  // Use a fake origin to leverage URL parsing safely.
  const u = new URL(originalPath, "http://x");
  u.searchParams.delete("auth_token");
  return u.pathname + (u.search ? u.search : "") + (u.hash || "");
}

export async function initAuth({ app, AUTH_TOKEN, isHttps }) {
  const AUTH_COOKIE_VALUE = getAuthCookieValue(AUTH_TOKEN);

  app.use((req, res, next) => {
    if (!AUTH_TOKEN) return next(); // no auth enabled

    const cookies = parseCookies(req.headers.cookie);
    const hasCookie = cookies[AUTH_COOKIE_NAME] === AUTH_COOKIE_VALUE;

    if (hasCookie) return next();

    // No cookie: check a one-time query token
    const u = new URL(req.url, "http://x"); // origin placeholder
    const token = u.searchParams.get("auth_token") || "";

    if (token && safeEqualStr(token, AUTH_TOKEN)) {
      // Good token → set cookie and redirect to clean URL (no query token)
      res.setHeader("Set-Cookie", makeAuthCookie(isHttps, AUTH_COOKIE_VALUE));
      const clean = stripAuthTokenFromUrlPath(req.url);
      // 303 avoids issues with non-GET replays
      res.status(303).setHeader("Location", clean).end();
      return;
    }

    // No/invalid token → simple error
    res
      .status(401)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .end(
        `<!doctype html>
<html><body style="font-family:system-ui;margin:2rem">
<h1>Unauthorized</h1>
<p>Missing or invalid <code>auth_token</code>.</p>
</body></html>`,
      );
  });
}

export async function getAuthToken() {
  const { AUTH_TOKEN } = process.env;
  delete process.env.AUTH_TOKEN; // don't want it to look to user
  if (AUTH_TOKEN == null) {
    return;
  }
  if (AUTH_TOKEN.length <= 6) {
    // set but short -- so make big random and secure
    return await secureRandomString(16);
  }
  // use supplied token
  return AUTH_TOKEN;
}
