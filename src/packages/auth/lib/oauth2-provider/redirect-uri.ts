/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Redirect URI matching with RFC 8252 support.
//
// RFC 8252 §7.3: For native apps using localhost, the redirect URI must
// match on scheme, host, and path, but the port is excluded from the
// comparison. Any port is accepted so the OS can assign an ephemeral one.

export function matchRedirectUri(
  actual: string,
  registered: string[],
): boolean {
  if (registered.includes(actual)) return true;
  try {
    const a = new URL(actual);
    if (a.hostname !== "localhost" && a.hostname !== "127.0.0.1") return false;
    for (const r of registered) {
      const reg = new URL(r);
      if (
        (reg.hostname === "localhost" || reg.hostname === "127.0.0.1") &&
        reg.protocol === a.protocol &&
        reg.pathname === a.pathname
      ) {
        return true;
      }
    }
  } catch {
    // invalid URL — no match
  }
  return false;
}
