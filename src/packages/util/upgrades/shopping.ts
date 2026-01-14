/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export type Period = "range" | "monthly" | "yearly";

export interface CustomDescription {
  title?: string; // user can change this
  description?: string; // user can change this
}

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

export type ComputeCostProps = CashVoucherCostProps;

export type ComputeCostPropsTypes = ComputeCostProps["type"];
