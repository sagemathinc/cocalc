import * as LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";

import { SiteLicensePublicInfo } from "./types";
import { query } from "../frame-editors/generic/client";


// To avoid overfetching, we cache this for a bit...
const site_license_public_info_cache = new LRU({ maxAge: 1000 * 3 * 60 });
export const site_license_public_info = reuseInFlight(async function(
  license_id: string
): Promise<SiteLicensePublicInfo> {
  if (site_license_public_info_cache.has(license_id)) {
    return site_license_public_info_cache.get(license_id);
  }
  const q = {
    query: {
      site_license_public_info: {
        id: license_id,
        title: null,
        activates: null,
        expires: null
      }
    }
  };
  const info = (await query(q)).query.site_license_public_info;
  site_license_public_info_cache.set(license_id, info);
  return info;
});
