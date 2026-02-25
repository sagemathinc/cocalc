/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getLogger from "@cocalc/backend/logger";
import { newGauge } from "@cocalc/backend/metrics";

function getStatusGauge() {
  return newGauge(
    "database",
    "db_latest_connection_ts_total",
    "Last time the connect/disconnect event was emitted",
    ["status"],
  );
}

const L = getLogger("db:record-connect-error");

// timestamp when the *first* disconnect event happend
// a "connect" event will reset this to null
let lastDisconnected: number | null = null;

// ATTN: do not move/rename this function, since it is referenced in postgres-base.coffee
export function recordDisconnected() {
  L.debug("disconnected");
  const now = Date.now();
  try {
    getStatusGauge().labels("disconnected").set(now);
  } catch (err) {
    L.debug("issue with database status gauge", err);
  }
  if (lastDisconnected == null) {
    lastDisconnected = now;
  }
}

// ATTN: do not move/rename this function, since it is referenced in postgres-base.coffee
export function recordConnected() {
  L.debug("connected");
  try {
    getStatusGauge().labels("connected").set(Date.now());
  } catch (err) {
    L.debug("issue with database status gauge", err);
  }
  lastDisconnected = null;
}

export function howLongDisconnectedMins(): number | undefined {
  if (lastDisconnected == null) {
    return undefined;
  } else {
    const last = lastDisconnected;
    const now = Date.now();
    const dtMin = (now - last) / 1000 / 60;
    return dtMin;
  }
}
