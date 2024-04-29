import { BaseType } from "antd/es/typography/Base";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Paragraph, Text } from "@cocalc/frontend/components";
import {
  LanguageModel,
  getLLMCost,
  isFreeModel,
} from "@cocalc/util/db-schema/llm-utils";
import { round2down, round2up } from "@cocalc/util/misc";

/*
NOTE: To get a quick idea about the numbers of how many completion tokens are returned, run this:

```sql
WITH data AS (
  SELECT model, (total_tokens - prompt_tokens) AS val
  FROM openai_chatgpt_log
  WHERE  time >= NOW() - '1 week'::interval
    AND tag like 'app:%'
)
SELECT model, PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY val) AS median
FROM data
GROUP BY model
ORDER BY median desc
```

This gives a range from about 100 to almost 700.
The maximum (just use the "MAX" function, easier than the median) is at almost the token limit (i.e. 2000).

That's the basis for the number 100 and 1000 below!
*/

export function LLMCostEstimation({
  model,
  tokens, // Note: use the "await imported" numTokensUpperBound function to get the number of tokens
  type,
}: {
  model: LanguageModel;
  tokens: number;
  type?: BaseType;
}) {
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");

  if (isFreeModel(model, isCoCalcCom)) {
    return (
      <Text style={{ textAlign: "right" }}>This model is free to use.</Text>
    );
  }

  const { prompt_tokens, completion_tokens } = getLLMCost(model, llm_markup);
  // NOTE: see explanation about for lower/upper number.
  // It could go up to the model's output token limit (i.e. even 2000)
  const cost1 = tokens * prompt_tokens + 100 * completion_tokens;
  const cost2 = tokens * prompt_tokens + 1000 * completion_tokens;
  const txt1 = round2down(cost1).toFixed(2);
  const txt2 = round2up(cost2).toFixed(2);
  return (
    <Text style={{ textAlign: "right" }} type={type}>
      Estimated cost: ${txt1} to ${txt2}{" "}
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
    </Text>
  );
}
