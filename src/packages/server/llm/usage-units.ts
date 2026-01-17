import { moneyRound2Up, toDecimal } from "@cocalc/util/money";
import {
  getLLMCost,
  type LanguageModelCore,
} from "@cocalc/util/db-schema/llm-utils";

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
  const cost = getLLMCost(model, 0);
  const dollars = toDecimal(cost.prompt_tokens)
    .mul(prompt_tokens)
    .add(toDecimal(cost.completion_tokens).mul(completion_tokens));
  if (!Number.isFinite(dollars.toNumber()) || dollars.lte(0)) {
    return 0;
  }
  return Math.max(
    1,
    moneyRound2Up(dollars.mul(UNITS_PER_DOLLAR)).toNumber(),
  );
}
