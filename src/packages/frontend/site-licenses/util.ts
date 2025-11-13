/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import LRU from "lru-cache";

import { SCHEMA } from "@cocalc/util/db-schema";
import { copy, trunc_left } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { query } from "../frame-editors/generic/client";
import { SiteLicensePublicInfo } from "./types";

// To avoid overfetching, we cache results for *a few seconds*.
const site_license_public_info_cache = new LRU({ ttl: 1000 * 15, max: 1000 });

export const site_license_public_info: (
  license_id: string,
  force?: boolean
) => Promise<SiteLicensePublicInfo | undefined> = reuseInFlight(async function (
  license_id: string,
  force: boolean = false
): Promise<SiteLicensePublicInfo | undefined> {
  if (!force && site_license_public_info_cache.has(license_id)) {
    const info = site_license_public_info_cache.get(license_id) as
      | SiteLicensePublicInfo
      | undefined;
    return info;
  }
  if (SCHEMA.site_license_public_info.user_query?.get?.fields == null) {
    throw Error("make typescript happy");
  }
  const site_license_public_info = copy(
    SCHEMA.site_license_public_info.user_query.get.fields
  );
  site_license_public_info.id = license_id;
  const q = {
    query: { site_license_public_info },
  };

  const info: SiteLicensePublicInfo | undefined = (await query(q))?.query
    ?.site_license_public_info;
  site_license_public_info_cache.set(license_id, info);
  return info;
});

export function trunc_license_id(license_id: string) {
  return trunc_left(license_id, 13);
}
