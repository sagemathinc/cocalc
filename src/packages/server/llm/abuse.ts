/*
This is a basic rate limitation for free and metered usage of LLMs.
- any call must be identified by an account (we had just by a cookie ID, but it got abused, hence noAccount=0)
- There is a distinction between "cocalc.com" and "on-prem":
   - cocalc.com has some models (the more expensive ones) which are metered per token and some which are free
   - on-prem: there is only rate limiting, no metered usage
- quotas are adjustable
- at it's core, this should limit individual users from too much free usage, and overall cap the usage
- monitoring as necessary, to give feedback for tweaking the parameters
*/

import { isObject } from "lodash";

import { newCounter, newGauge, newHistogram } from "@cocalc/backend/metrics";
import { process_env_int } from "@cocalc/backend/misc";
import getPool, { CacheTime } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";
import {
  LanguageModel,
  fromCustomOpenAIModel,
  fromOllamaModel,
  isCustomOpenAI,
  isLanguageModel,
  isOllamaLLM,
  isUserDefinedModel,
} from "@cocalc/util/db-schema/llm-utils";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { isValidUUID } from "@cocalc/util/misc";
import isValidAccount from "../accounts/is-valid-account";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";

const GLOBAL_QUOTA_UNITS = process_env_int("COCALC_LLM_QUOTA_GLOBAL", 10 ** 9);

const prom_quota_global = newGauge(
  "llm",
  "abuse_usage_global_pct",
  "Language model abuse limit, global, 0 to 100 percent of limit, rounded",
  ["quota"],
);

const prom_quota_per_account = newHistogram(
  "llm",
  "abuse_usage_account_pct",
  "Language model usage per account, to see if users reach certain thresholds for their account usage.",
  { buckets: [25, 50, 75, 100, 110] },
);

const prom_rejected = newCounter(
  "llm",
  "abuse_rejected_total",
  "Language model requests rejected",
  ["quota"],
);

// Throws an exception if the request should not be allowed.
export async function checkForAbuse({
  account_id,
  analytics_cookie,
  model,
}: {
  account_id?: string;
  analytics_cookie?: string;
  model: LanguageModel;
}): Promise<void> {
  if (!account_id) {
    // Due to assholes like gpt4free, which is why "we can't have nice things".
    // https://github.com/xtekky/gpt4free/tree/main/gpt4free/cocalc
    throw Error("You must create an account.");
  }
  if (!isValidUUID(account_id) && !isValidUUID(analytics_cookie)) {
    // at least some amount of tracking.
    throw Error("at least one of account_id or analytics_cookie must be set");
  }

  if (!isLanguageModel(model)) {
    throw Error(`Invalid model "${model}"`);
  }

  // it's a valid model name, but maybe not enabled by the admin (by default, all are enabled)
  if (!(await isUserSelectableLanguageModel(model))) {
    throw new Error(`Model "${model}" is disabled.`);
  }

  const is_cocalc_com =
    (await getServerSettings()).kucalc === KUCALC_COCALC_COM;
  const limits = await getMembershipLimits(account_id);
  if (limits.units_5h != null) {
    const usage5h = await recentUsageUnits({
      cache: "short",
      period: "5 hours",
      account_id,
      analytics_cookie,
    });
    prom_quota_per_account.observe(100 * (usage5h / limits.units_5h));
    if (usage5h > limits.units_5h) {
      const resetIn = await timeUntilWindowReset({
        account_id,
        analytics_cookie,
        period: "5 hours",
      });
      prom_rejected.labels("account_5h").inc();
      throw new Error(
        `You have reached your 5-hour LLM usage limit.${resetIn ? ` Limit resets in ${resetIn}.` : ""} Please try again later or upgrade your membership.`,
      );
    }
  }

  if (limits.units_7d != null) {
    const usage7d = await recentUsageUnits({
      cache: "short",
      period: "7 days",
      account_id,
      analytics_cookie,
    });
    if (usage7d > limits.units_7d) {
      const resetIn = await timeUntilWindowReset({
        account_id,
        analytics_cookie,
        period: "7 days",
      });
      prom_rejected.labels("account_7d").inc();
      throw new Error(
        `You have reached your 7-day LLM usage limit.${resetIn ? ` Limit resets in ${resetIn}.` : ""} Please try again later or upgrade your membership.`,
      );
    }
  }

  // Prevent more sophisticated abuse, e.g., changing analytics_cookie or account frequently,
  // or just a general huge surge in usage.
  const overallUsage = await recentUsageUnits({
    cache: "long",
    period: "1 hour",
  });
  prom_quota_global
    .labels("global")
    .set(Math.round(100 * (overallUsage / GLOBAL_QUOTA_UNITS)));
  if (overallUsage > GLOBAL_QUOTA_UNITS) {
    prom_rejected.labels("global").inc();
    throw new Error(
      `There is too much usage of language models right now.  Please try again later ${
        is_cocalc_com ? " or use a non-free language model such as GPT-4" : ""
      }.`,
    );
  }
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
  // some caching so if user is hitting us a lot, we don't hit the database to
  // decide they are abusive -- at the same time, short enough that we notice.
  // Recommendation: "short"
  cache?: CacheTime;
}): Promise<number> {
  const pool = getPool(cache);
  let query, args;
  if (account_id) {
    if (!(await isValidAccount(account_id))) {
      throw Error(`invalid account_id ${account_id}`);
    }
    query = `SELECT SUM(COALESCE(usage_units, 0)) AS usage FROM openai_chatgpt_log WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [account_id];
  } else if (analytics_cookie) {
    query = `SELECT SUM(COALESCE(usage_units, 0)) AS usage FROM openai_chatgpt_log WHERE analytics_cookie=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [analytics_cookie];
  } else {
    query = `SELECT SUM(COALESCE(usage_units, 0)) AS usage FROM openai_chatgpt_log WHERE time >= NOW() - INTERVAL '${period}'`;
    args = [];
  }
  const { rows } = await pool.query(query, args);
  // console.log("rows = ", rows);
  return parseInt(rows[0]?.["usage"] ?? 0); // undefined = no results in above select,
}

async function timeUntilWindowReset({
  period,
  account_id,
  analytics_cookie,
}: {
  period: "5 hours" | "7 days";
  account_id?: string;
  analytics_cookie?: string;
}): Promise<string | undefined> {
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
  const remainingMs = Math.max(0, oldestMs + windowMs - Date.now());
  if (remainingMs <= 0) return;
  return formatDuration(remainingMs);
}

function formatDuration(ms: number): string {
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

async function isUserSelectableLanguageModel(
  model: LanguageModel,
): Promise<boolean> {
  const {
    selectable_llms,
    ollama_configuration,
    ollama_enabled,
    custom_openai_enabled,
    custom_openai_configuration,
  } = await getServerSettings();

  if (isUserDefinedModel(model)) {
    // no need to check based on the account/other_settings info
    return true;
  }

  if (isOllamaLLM(model)) {
    if (ollama_enabled && isObject(ollama_configuration)) {
      const om = fromOllamaModel(model);
      const oc = ollama_configuration[om];
      return oc?.enabled ?? true;
    }
  } else if (isCustomOpenAI(model)) {
    if (custom_openai_enabled && isObject(custom_openai_configuration)) {
      const om = fromCustomOpenAIModel(model);
      const oc = custom_openai_configuration[om];
      return oc?.enabled ?? true;
    }
  } else if (selectable_llms.includes(model)) {
    return true;
  }
  return false;
}

async function getMembershipLimits(account_id: string) {
  const resolution = await resolveMembershipForAccount(account_id);
  const limits = resolution?.entitlements?.llm_limits ?? {};
  const units5h = extractLimit(limits, ["units_5h", "limit_5h"]);
  const units7d = extractLimit(limits, ["units_7d", "limit_7d"]);
  return {
    units_5h: units5h,
    units_7d: units7d,
  };
}

function extractLimit(limits: unknown, keys: string[]): number | undefined {
  if (limits == null || typeof limits !== "object") return;
  for (const key of keys) {
    const value = (limits as Record<string, unknown>)[key];
    if (typeof value == "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return;
}
