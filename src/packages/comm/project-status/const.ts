/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const ALERT_HIGH_PCT = 90;
export const ALERT_MEDIUM_PCT = 75;
export const ALERT_LOW_PCT = 50; // not really an alert, more a gentle indicator
export const ALERT_DISK_FREE = 100; // MiB
export const RAISE_ALERT_AFTER_MIN = 1; // after that many minutes of alert state, raise the alert
export const STATUS_UPDATES_INTERVAL_S = parseInt(
  process.env.COCALC_STATUS_UPDATES_INTERVAL_S ?? "60"
);
