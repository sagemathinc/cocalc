/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { CookieOptions, Request, Response } from "express";
import ms from "ms";

import {
  ANALYTICS_COOKIE_NAME,
  is_valid_uuid_string,
  uuid,
} from "@cocalc/util/misc";

// This is a fallback, if either analytics is not activated or it has not been set yet.
// The usual case would be that hub/analytics-script.ts sets the cookie.
// @return a UUID string
export function ensureAnalyticsCookie(req: Request, res: Response): string {
  const analytics_cookie = req.cookies[ANALYTICS_COOKIE_NAME];

  if (is_valid_uuid_string(analytics_cookie)) {
    return analytics_cookie;
  } else {
    // set the cookie (TODO sign it?  that would be good so that
    // users cannot fake a cookie.)
    // Note: we don't set a domain, because this fallback is only called from within the same domain.
    const analytics_token = uuid();
    const opts: CookieOptions = {
      path: "/",
      maxAge: ms("7 days"),
      httpOnly: true,
    };
    res.cookie(ANALYTICS_COOKIE_NAME, analytics_token, opts);
    return analytics_token;
  }
}
