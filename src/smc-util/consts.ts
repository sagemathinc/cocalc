/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Do NOT change this - this exact string is assumed in smc-hub/user-remember-me and smc-util/client
// Of course, they do use this very constant.  It's just that if you change this you might have
// to rebuild and restart all servers, etc., which gets complicated...
export const NOT_SIGNED_IN = "not signed in";

const VERSION_COOKIE_NAME = "cocalc_version";

export function versionCookieName(base_path: string): string {
  return (
    (base_path.length <= 1 ? "" : encodeURIComponent(base_path)) +
    VERSION_COOKIE_NAME
  );
}
