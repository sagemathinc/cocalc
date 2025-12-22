import getPool, { CacheTime } from "@cocalc/database/pool";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";
import { UNITS_PER_DOLLAR } from "./usage-units";
import isValidAccount from "../accounts/is-valid-account";

export interface LLMUsageWindowStatus {
  window: "5h" | "7d";
  used: number;
  limit?: number;
  remaining?: number;
  reset_at?: Date;
  reset_in?: string;
}

export interface LLMUsageStatus {
  units_per_dollar: number;
  windows: LLMUsageWindowStatus[];
}

export async function getLLMUsageStatus({
  account_id,
  analytics_cookie,
}: {
  account_id?: string;
  analytics_cookie?: string;
}): Promise<LLMUsageStatus> {
  if (account_id && !(await isValidAccount(account_id))) {
    throw Error(`invalid account_id ${account_id}`);
  }
  const limits = await getMembershipLimits(account_id);
  const windows: LLMUsageWindowStatus[] = [];

  const window5h = await getUsageWindow({
    window: "5h",
    period: "5 hours",
    account_id,
    analytics_cookie,
    limit: limits.units_5h,
    cache: "short",
  });
  windows.push(window5h);

  const window7d = await getUsageWindow({
    window: "7d",
    period: "7 days",
    account_id,
    analytics_cookie,
    limit: limits.units_7d,
    cache: "short",
  });
  windows.push(window7d);

  return {
    units_per_dollar: UNITS_PER_DOLLAR,
    windows,
  };
}

async function getUsageWindow({
  window,
  period,
  account_id,
  analytics_cookie,
  limit,
  cache,
}: {
  window: LLMUsageWindowStatus["window"];
  period: "5 hours" | "7 days";
  account_id?: string;
  analytics_cookie?: string;
  limit?: number;
  cache?: CacheTime;
}): Promise<LLMUsageWindowStatus> {
  const used = await recentUsageUnits({
    period,
    account_id,
    analytics_cookie,
    cache,
  });
  const reset_at = await getWindowResetAt({
    period,
    account_id,
    analytics_cookie,
  });
  const remaining =
    limit != null && Number.isFinite(limit) ? Math.max(0, limit - used) : undefined;
  const reset_in = reset_at
    ? formatDuration(Math.max(0, reset_at.getTime() - Date.now()))
    : undefined;
  return {
    window,
    used,
    limit,
    remaining,
    reset_at,
    reset_in: reset_in && reset_in.length > 0 ? reset_in : undefined,
  };
}

async function recentUsageUnits({
  period,
  account_id,
  analytics_cookie,
  cache,
}: {
  period: string;
  account_id?: string;
  analytics_cookie?: string;
  cache?: CacheTime;
}): Promise<number> {
  const pool = getPool(cache);
  let query;
  let args: string[] = [];
  if (account_id) {
    query = `SELECT SUM(COALESCE(usage_units, 0)) AS usage FROM openai_chatgpt_log WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [account_id];
  } else if (analytics_cookie) {
    query = `SELECT SUM(COALESCE(usage_units, 0)) AS usage FROM openai_chatgpt_log WHERE analytics_cookie=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [analytics_cookie];
  } else {
    query = `SELECT SUM(COALESCE(usage_units, 0)) AS usage FROM openai_chatgpt_log WHERE time >= NOW() - INTERVAL '${period}'`;
  }
  const { rows } = await pool.query(query, args);
  return parseInt(rows[0]?.["usage"] ?? 0);
}

async function getWindowResetAt({
  period,
  account_id,
  analytics_cookie,
}: {
  period: "5 hours" | "7 days";
  account_id?: string;
  analytics_cookie?: string;
}): Promise<Date | undefined> {
  const pool = getPool("short");
  let query;
  let args: string[] = [];
  if (account_id) {
    query = `SELECT time FROM openai_chatgpt_log
             WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'
             ORDER BY time ASC LIMIT 1`;
    args = [account_id];
  } else if (analytics_cookie) {
    query = `SELECT time FROM openai_chatgpt_log
             WHERE analytics_cookie=$1 AND time >= NOW() - INTERVAL '${period}'
             ORDER BY time ASC LIMIT 1`;
    args = [analytics_cookie];
  } else {
    return;
  }
  const result = await pool.query(query, args);
  const rows = result.rows as Array<{ time?: string | Date }>;
  const oldest = rows[0]?.time;
  if (!oldest) return;
  const oldestMs = new Date(oldest).getTime();
  if (!Number.isFinite(oldestMs)) return;
  const windowMs =
    period === "5 hours" ? 5 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const resetMs = oldestMs + windowMs;
  return new Date(resetMs);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days == 1 ? "" : "s"}`);
  if (hours > 0) parts.push(`${hours} hour${hours == 1 ? "" : "s"}`);
  if (days == 0 && hours == 0 && minutes > 0) {
    parts.push(`${minutes} minute${minutes == 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

async function getMembershipLimits(account_id?: string) {
  if (!account_id) {
    return { units_5h: 0, units_7d: 0 };
  }
  const resolution = await resolveMembershipForAccount(account_id);
  const limits = resolution?.entitlements?.llm_limits ?? {};
  const units5h = extractLimit(limits, ["units_5h", "limit_5h"]);
  const units7d = extractLimit(limits, ["units_7d", "limit_7d"]);
  return {
    units_5h: units5h,
    units_7d: units7d,
  };
}

function extractLimit(limits: unknown, keys: string[]): number {
  if (limits == null || typeof limits !== "object") return 0;
  for (const key of keys) {
    const value = (limits as Record<string, unknown>)[key];
    if (typeof value == "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return 0;
}
