/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Request } from "express";

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { ANALYTICS_COOKIE_NAME } from "@cocalc/util/consts";
import { getClientIpAddress } from "@cocalc/util/get-client-ip-address";
import { isValidAnonymousID } from "@cocalc/util/misc";

// Get anonymous user ID from cookie or IP address
export async function getAnonymousID(
  req: Request,
): Promise<string | undefined> {
  const { analytics_cookie: analytics_enabled } = await getServerSettings();

  if (analytics_enabled) {
    const cookie = req.cookies[ANALYTICS_COOKIE_NAME];
    if (isValidAnonymousID(cookie)) {
      return cookie;
    }
  }

  // Fall back to IP address
  const connectingIp = getClientIpAddress(req);

  if (isValidAnonymousID(connectingIp)) {
    return connectingIp;
  }

  return undefined;
}
