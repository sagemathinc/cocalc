/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
export const AVG_MONTH_DAYS = 30.5;
export const AVG_YEAR_DAYS = 12 * AVG_MONTH_DAYS;
export const ONE_MONTH_MS = AVG_MONTH_DAYS * ONE_DAY_MS;

// throughout the UI, we show this price as the minimum (per month)
// It is nice if it is vague enough to match price changes.
export const LICENSE_MIN_PRICE = "a few $ per month";

// Trial Banner in the UI
export const EVALUATION_PERIOD_DAYS = 3;
export const BANNER_NON_DISMISSIBLE_DAYS = 7;

// The "standard license" disk size.
// used in next/store and student-pay
// TODO: once the new file storage is in place, incease it to 10
export const STANDARD_DISK = 3;
