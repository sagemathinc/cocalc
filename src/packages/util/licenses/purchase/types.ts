/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Uptime } from "@cocalc/util/consts/site-license";
import type { DedicatedDisk, DedicatedVM } from "@cocalc/util/types/dedicated";
import type {
  CustomDescription,
  LicenseSource,
  Period,
} from "@cocalc/util/upgrades/shopping";

export type User = "academic" | "business";
export type Upgrade = "basic" | "standard" | "max" | "custom";
export type Subscription = "no" | "monthly" | "yearly";
export type CustomUpgrades =
  | "ram"
  | "dedicated_ram"
  | "cpu"
  | "dedicated_cpu"
  | "disk"
  | "always_running"
  | "member";

export interface Cost {
  cost: number;
  cost_per_unit: number;
  cost_per_project_per_month: number;
  cost_sub_month: number;
  cost_sub_year: number;
  quantity: number;
  // if buying a subscription, the cost for the first period
  // may be less than cost_sub_month / cost_sub_year, depending
  // on the closing statement date of the user.
  cost_sub_first_period?: number;
  period: Period;
}

export type CostInput =
  | (Partial<PurchaseInfo> & {
      type: "vm" | "disk" | "quota";
      subscription: Subscription;
    })
  | { type: "cash-voucher"; amount: number; subscription: Subscription };

export interface CostInputPeriod extends Cost {
  input: CostInput;
}

export interface StartEndDates {
  start: Date | null;
  end: Date | null;
}

export interface StartEndDatesWithStrings {
  start: Date | string;
  end: Date | string;
}

interface Version {
  version: string; // it's just a string with no special interpretation.
}

interface PurchaseInfoQuota0 {
  type: "quota";
  user: User;
  upgrade: Upgrade;
  quantity: number;
  subscription: Subscription;
  quote?: boolean;
  quote_info?: string;
  payment_method?: string;
  cost?: Cost;
  cost_per_hour?: number;
  custom_ram: number;
  custom_dedicated_ram: number;
  custom_cpu: number;
  custom_dedicated_cpu: number;
  custom_disk: number;
  custom_member: boolean;
  custom_uptime: Uptime;
  custom_always_running?: boolean; // no longer really used, defined by custom_uptime above!
  boost?: boolean;
  run_limit?: number;
}

type PurchseInfoSource = { source?: LicenseSource };

export type PurchaseInfoQuota = PurchaseInfoQuota0 &
  CustomDescription &
  StartEndDates &
  PurchseInfoSource;

export type PurchaseInfoVoucher = {
  type: "vouchers";
  id: number;
  quantity: number;
  cost: number;
  tax: number;
};

export type PurchaseInfoVM = {
  type: "vm";
  quantity: 1;
  dedicated_vm: DedicatedVM;
  subscription: "no";
  cost?: Cost;
  payment_method?: string;
};

export type PurchaseInfoDisk = {
  // note that start is set automatically when actually purchasing
  type: "disk";
  quantity: 1;
  subscription: Omit<Subscription, "no">;
  dedicated_disk: DedicatedDisk;
  cost?: Cost;
  payment_method?: string;
};

export type PurchaseInfo = Version &
  (
    | PurchaseInfoQuota
    | (PurchaseInfoVoucher & CustomDescription)
    | (PurchaseInfoVM & StartEndDates & CustomDescription)
    | (PurchaseInfoDisk & StartEndDates & CustomDescription)
  );

// stripe's metadata can only handle string or number values.
export type ProductMetadataQuota = Record<
  | "user"
  | "ram"
  | "cpu"
  | "dedicated_ram"
  | "dedicated_cpu"
  | "disk"
  | "uptime"
  | "member"
  | "subscription"
  | "boost",
  string | number | null
> & {
  duration_days?: number;
};

export type ProductMetadataVM = Record<"machine", string | number | null> & {
  duration_days?: number;
  type: "vm";
};

export type ProductMetadataDisk = Record<
  "size_gb" | "speed",
  string | number | null
> & {
  duration_days?: number;
  type: "disk";
};

export interface ProductMetadataVouchers {
  type: "vouchers";
  id: number; // id of the voucher in the vouchers table of the database
}

export type ProductMetadata =
  | ProductMetadataVouchers
  | ProductMetadataDisk
  | ProductMetadataQuota
  | ProductMetadataVM;
