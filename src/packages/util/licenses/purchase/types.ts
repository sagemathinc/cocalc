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
  discounted_cost: number;
  cost_per_project_per_month: number;
  cost_sub_month: number;
  cost_sub_year: number;
}

export interface CostInputPeriod extends Cost {
  input: Partial<PurchaseInfo>;
  period: Period;
}

export interface StartEndDates {
  start: Date;
  end?: Date;
}

export interface StartEndDatesWithStrings {
  start: Date | string;
  end?: Date | string;
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Uptime } from "@cocalc/util/consts/site-license";
import { DedicatedDisk, DedicatedVM } from "@cocalc/util/types/dedicated";
import { CustomDescription, Period } from "../../upgrades/shopping";

export type PurchaseInfoQuota = {
  type: "quota";
  user: User;
  upgrade: Upgrade;
  quantity: number;
  subscription: Subscription;
  quote?: boolean;
  quote_info?: string;
  payment_method?: string;
  cost?: Cost;
  custom_ram: number;
  custom_dedicated_ram: number;
  custom_cpu: number;
  custom_dedicated_cpu: number;
  custom_disk: number;
  custom_member: boolean;
  custom_uptime: Uptime;
  custom_always_running?: boolean; // no longer really used, defined by custom_uptime above!
  boost?: boolean;
} & StartEndDates &
  CustomDescription;

export type PurchaseInfo =
  | PurchaseInfoQuota
  | ({
      type: "vm";
      quantity: 1;
      dedicated_vm: DedicatedVM;
      subscription: "no";
      cost?: Cost;
      payment_method?: string;
    } & StartEndDates &
      CustomDescription)
  | ({
      type: "disk";
      quantity: 1;
      subscription: Omit<Subscription, "no">;
      dedicated_disk: DedicatedDisk;
      cost?: Cost;
      payment_method?: string;
    } & CustomDescription);

// stripe's metadata can only handle string or number values.
export type ProductMetadataQuota =
  | Record<
      | "user"
      | "ram"
      | "cpu"
      | "dedicated_ram"
      | "dedicated_cpu"
      | "disk"
      | "uptime"
      | "member"
      | "subscription",
      string | number | null
    > & {
      duration_days?: number;
    };

export type ProductMetadataVM =
  | Record<"machine", string | number | null> & {
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

export type ProductMetadata =
  | ProductMetadataDisk
  | ProductMetadataQuota
  | ProductMetadataVM;
