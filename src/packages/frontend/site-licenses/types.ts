/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { TypedMap } from "@cocalc/frontend/app-framework";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import { LicenseStatus, Reason, Upgrades } from "@cocalc/util/upgrades/quota";

export type SiteLicenseUpgrades =
  | Upgrades
  | { reason?: Reason; status?: LicenseStatus };

export interface SiteLicensePublicInfo {
  id: string;
  title: string;
  description: string;
  created: Date;
  activates?: Date;
  expires?: Date;
  run_limit?: number;
  upgrades?: SiteLicenseUpgrades;
  is_manager?: boolean;
  managers?: string[];
  running?: number;
  applied?: number;
  quota?: SiteLicenseQuota;
  subscription_id?: number;
}

export type SiteLicenses = {
  [license_id: string]: TypedMap<SiteLicensePublicInfo> | null;
};
