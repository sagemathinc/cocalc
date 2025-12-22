import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { round2up } from "@cocalc/util/misc";
import { getLLMCost, type LanguageModelCore } from "@cocalc/util/db-schema/llm-utils";

export const UNITS_PER_DOLLAR = 100;

export async function computeUsageUnits({
  model,
  prompt_tokens,
  completion_tokens,
}: {
  model: LanguageModelCore;
  prompt_tokens: number;
  completion_tokens: number;
}): Promise<number> {
  const { pay_as_you_go_openai_markup_percentage } = await getServerSettings();
  const cost = getLLMCost(model, pay_as_you_go_openai_markup_percentage);
  const dollars =
    cost.prompt_tokens * prompt_tokens +
    cost.completion_tokens * completion_tokens;
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return 0;
  }
  return Math.max(1, round2up(dollars * UNITS_PER_DOLLAR));
}
