/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { expire_time } from "@cocalc/util/misc";
import { get_server_settings } from "../settings/server-settings";

// this converts what's in the pii_expired setting to a new Date in the future
export function pii_retention_to_future<T extends object>(
  pii_retention: number | false,
  data?: T & { expire?: Date },
): Date | undefined {
  if (!pii_retention) return;
  const future: Date = expire_time(pii_retention);
  if (data != null) {
    data.expire = future;
  }
  return future;
}

// use this to get the "expire" value for storing certain entries in the DB,
// which contain personally identifiable information.
// if data is set, it's expire field will be set. in any case, it returns the "Date"
// in the future.
export async function pii_expire<T extends object>(
  data?: T & { expire?: Date },
): Promise<Date | undefined> {
  const settings = await get_server_settings();
  return pii_retention_to_future<T>(settings.pii_retention, data);
}
