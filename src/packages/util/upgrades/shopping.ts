/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { LicenseIdleTimeouts } from "../consts/site-license";
import { User } from "../licenses/purchase/types";
import { DedicatedDisk, DedicatedVM } from "../types/dedicated";

export type LicenseType = "quota" | "vm" | "disk";

export type Period = "range" | "monthly" | "yearly";

export type DateRange = [Date | undefined, Date | undefined];

export type ComputeCostProps =
  | {
      type: "quota";
      user: User;
      run_limit: number;
      period: Period;
      range: DateRange;
      ram: number;
      cpu: number;
      disk: number;
      always_running: boolean;
      member: boolean;
      uptime: keyof typeof LicenseIdleTimeouts | "always_running";
      boost?: boolean;
    }
  | {
      type: "vm";
      period: "range";
      range: DateRange;
      dedicated_vm: DedicatedVM;
    }
  | { type: "disk"; dedicated_disk: DedicatedDisk; period: Period };

export type ComputeCostPropsTypes = ComputeCostProps["type"];

export interface CustomDescription {
  title?: string; // user can change this
  description?: string; // user can change this
}

// server side, what comes out of the DB in the "description" column in the cart
// for the implementation, check out what next/components/store/add-box.tsx is doing
export type SiteLicenseDescriptionDB =
  | ({
      type: "quota";
      user: User;
      run_limit: number;
      period: Period;
      range?: [string, string]; // should be converted to [Date, Date]
      ram: number;
      cpu: number;
      disk: number;
      always_running: boolean;
      member: boolean;
      uptime: keyof typeof LicenseIdleTimeouts | "always_running";
      boost?: boolean;
    } & CustomDescription)
  | ({
      type: "vm";
      period: "range";
      range: DateRange;
      dedicated_vm: DedicatedVM;
    } & CustomDescription)
  | ({
      type: "disk";
      dedicated_disk: DedicatedDisk;
      period: Period;
    } & CustomDescription);
