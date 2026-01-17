/*
Return model usage costs for UI display (throttling units).
*/

import { UNITS_PER_DOLLAR } from "@cocalc/server/llm/usage-units";
import {
  LLM_COST,
  LLM_USERNAMES,
  USER_SELECTABLE_LANGUAGE_MODELS,
  getLLMCost,
} from "@cocalc/util/db-schema/llm-utils";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }

  const models: Record<
    string,
    {
      display: string;
      prompt_cost_per_1k: number;
      completion_cost_per_1k: number;
      prompt_units_per_1k: number;
      completion_units_per_1k: number;
      free: boolean;
    }
  > = {};

  for (const model of USER_SELECTABLE_LANGUAGE_MODELS) {
    const cost = getLLMCost(model, 0);
    const prompt_cost_per_1k = cost.prompt_tokens * 1000;
    const completion_cost_per_1k = cost.completion_tokens * 1000;
    models[model] = {
      display: LLM_USERNAMES[model] ?? model,
      prompt_cost_per_1k,
      completion_cost_per_1k,
      prompt_units_per_1k: prompt_cost_per_1k * UNITS_PER_DOLLAR,
      completion_units_per_1k: completion_cost_per_1k * UNITS_PER_DOLLAR,
      free: LLM_COST[model].free,
    };
  }

  return {
    units_per_dollar: UNITS_PER_DOLLAR,
    models,
  };
}
