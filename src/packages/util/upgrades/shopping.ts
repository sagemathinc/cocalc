/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { LicenseIdleTimeouts } from "../consts/site-license";
import { User } from "../licenses/purchase/types";

export type LicenseType = "quota";

export type Period = "range" | "monthly" | "yearly";

export type DateRange = [Date | undefined, Date | undefined];

// the store's source page from where a site-license has been created
export type LicenseSource = "site-license" | "course";

export type QuotaCostProps = {
  type: "quota";
  source?: LicenseSource;
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
};

export type CashVoucherCostProps = {
  type: "cash-voucher";
  amount: number;
  numVouchers: number;
  whenPay: "now" | "admin";
  length: number;
  title: string;
  prefix: string;
  postfix: string;
  charset: string;
  expire: Date;
};

export type ComputeCostProps =
  | CashVoucherCostProps
  | QuotaCostProps;

export type ComputeCostPropsTypes = ComputeCostProps["type"];

export interface CustomDescription {
  title?: string; // user can change this
  description?: string; // user can change this
}

export interface QuotaCostPropsDB
  extends Omit<QuotaCostProps, "range" | "always_running"> {
  range?: readonly [string, string]; // should be converted to [Date, Date]
  always_running?: boolean;
}

// server side, what comes out of the DB in the "description" column in the cart
// for the implementation, check out what next/components/store/add-box.tsx is doing
export type SiteLicenseDescriptionDB =
  | (QuotaCostPropsDB & CustomDescription);
