import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Paragraph } from "@cocalc/frontend/components";
import { LanguageModel, getLLMCost } from "@cocalc/util/db-schema/llm-utils";
import { round2up } from "@cocalc/util/misc";

// Note: use the "await imported" numTokensUpperBound function to get the number of tokens

export function LLMCostEstimation({
  model,
  tokens,
}: {
  model: LanguageModel;
  tokens: number;
}) {
  const llm_markup = useTypedRedux("customize", "llm_markup");

  const { prompt_tokens, completion_tokens } = getLLMCost(model, llm_markup);
  // NOTE: lower/upper number of output tokens is just a good guess.
  // It could go up to the model's output token limit (maybe even 2000)
  const cost1 = tokens * prompt_tokens + 50 * completion_tokens;
  const cost2 = tokens * prompt_tokens + 1000 * completion_tokens;
  return (
    <Paragraph type="secondary" style={{ textAlign: "right" }}>
      Cost estimation: ${round2up(cost1)} to ${round2up(cost2)}{" "}
      <HelpIcon title="LLM Cost Estimation">
        <Paragraph>
          The cost of calling a large language model is based on the number of
          tokens. A token can be thought of as a piece of a word. For example,
          the word "cat" is one token, while "unbelievable" breaks down into
          three tokens: "un", "believe", "able".
        </Paragraph>
        <Paragraph>
          The total cost of your interaction depends on the number of tokens in
          your message and the LLM's reply. Please note that the exact cost is
          variable for each query. We're unable to predict the precise charge
          for each interaction, as it depends on the specific number tokens.
        </Paragraph>
        <Paragraph>
          The given range is based on a typical interaction. In rare situations,
          the total cost could be a bit higher.
        </Paragraph>
      </HelpIcon>
    </Paragraph>
  );
}
