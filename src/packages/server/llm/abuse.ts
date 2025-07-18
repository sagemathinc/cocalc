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
import { assertPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import {
  LanguageModel,
  LanguageServiceCore,
  fromCustomOpenAIModel,
  fromOllamaModel,
  isCustomOpenAI,
  isFreeModel,
  isLanguageModel,
  isOllamaLLM,
  isUserDefinedModel,
  model2service,
} from "@cocalc/util/db-schema/llm-utils";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { isValidAnonymousID, isValidUUID } from "@cocalc/util/misc";
import isValidAccount from "../accounts/is-valid-account";

// These are tokens over a given period of time – summed by account/anonymous_id or global.
const QUOTAS = {
  noAccount: process_env_int("COCALC_LLM_QUOTA_NO_ACCOUNT", 0),
  account: process_env_int("COCALC_LLM_QUOTA_ACCOUNT", 10 ** 5),
  global: process_env_int("COCALC_LLM_QUOTA_GLOBAL", 10 ** 6),
} as const;

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
  anonymous_id,
  model,
}: {
  account_id?: string;
  anonymous_id?: string;
  model: LanguageModel;
}): Promise<void> {
  if (!account_id) {
    // Due to assholes like gpt4free, which is why "we can't have nice things".
    // https://github.com/xtekky/gpt4free/tree/main/gpt4free/cocalc
    throw Error("You must create an account.");
  }
  if (!isValidUUID(account_id) && !isValidAnonymousID(anonymous_id)) {
    // at least some amount of tracking.
    throw Error("at least one of account_id or anonymous_id must be set");
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

  if (!isFreeModel(model, is_cocalc_com)) {
    const service = model2service(model) as LanguageServiceCore;
    // This is a for-pay product, so let's make sure user can purchase it.
    await assertPurchaseAllowed({ account_id, service });
    // We always allow usage of for pay models, since the user is paying for
    // them.  Only free models need to be throttled.
    return;
  }

  // Below, we are only concerned with free models.

  const usage = await recentUsage({
    cache: "short",
    period: "1 hour",
    account_id,
    anonymous_id,
  });

  // this fluctuates for each account, we'll tally up how often users end up in certain usage buckets
  // that's more explicit than a histogram
  prom_quota_per_account.observe(100 * (usage / QUOTAS.account));

  // console.log("usage = ", usage);
  if (account_id) {
    if (usage > QUOTAS.account) {
      prom_rejected.labels("account").inc();
      throw new Error(
        `You may use at most ${
          QUOTAS.account
        } tokens per hour. Please try again later${
          is_cocalc_com ? " or use a non-free language model such as GPT-4" : ""
        }.`,
      );
    }
  } else if (usage > QUOTAS.noAccount) {
    prom_rejected.labels("no_account").inc();
    throw new Error(
      `You may use at most ${QUOTAS.noAccount} tokens per hour. Sign in to increase your quota.`,
    );
  }

  // Prevent more sophisticated abuse, e.g., changing anonymous_id or account frequently,
  // or just a general huge surge in usage.
  const overallUsage = await recentUsage({ cache: "long", period: "1 hour" });
  prom_quota_global
    .labels("global")
    .set(Math.round(100 * (overallUsage / QUOTAS.global)));
  if (overallUsage > QUOTAS.global) {
    prom_rejected.labels("global").inc();
    throw new Error(
      `There is too much usage of language models right now.  Please try again later ${
        is_cocalc_com ? " or use a non-free language model such as GPT-4" : ""
      }.`,
    );
  }
}

async function recentUsage({
  period,
  account_id,
  anonymous_id,
  cache,
}: {
  period: string;
  account_id?: string;
  anonymous_id?: string;
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
    query = `SELECT SUM(total_tokens) AS usage FROM openai_chatgpt_log WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [account_id];
  } else if (anonymous_id) {
    // still setting analytics_cookie in the db query, because this was before generalizing to an anonymous_id string
    query = `SELECT SUM(total_tokens) AS usage FROM openai_chatgpt_log WHERE analytics_cookie=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [anonymous_id];
  } else {
    query = `SELECT SUM(total_tokens) AS usage FROM openai_chatgpt_log WHERE time >= NOW() - INTERVAL '${period}'`;
    args = [];
  }
  const { rows } = await pool.query(query, args);
  // console.log("rows = ", rows);
  return parseInt(rows[0]?.["usage"] ?? 0); // undefined = no results in above select,
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
