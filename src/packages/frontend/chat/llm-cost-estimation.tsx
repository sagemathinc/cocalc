import { Tooltip } from "antd";

import { CSS } from "@cocalc/frontend/app-framework";
import { HelpIcon, Paragraph } from "@cocalc/frontend/components";
import { ESTIMATION_HELP_TEXT } from "@cocalc/frontend/misc/llm-cost-estimation";

export function LLMCostEstimation({
  llm_cost,
  compact,
  style,
}: {
  llm_cost?: [number, number] | null;
  compact: boolean; // only mean is shown
  style?: CSS;
}) {
  if (!llm_cost) return null;

  const [min, max] = llm_cost;
  const sum = min + max;
  if (min == null || max == null || isNaN(sum)) return null;
  const isFree = min === 0 && max === 0;
  const range = (
    <>
      ${min.toFixed(2)} - ${max.toFixed(2)}
    </>
  );
  const cost = isFree ? (
    <>Free</>
  ) : compact ? (
    <Tooltip title={<>Estimated cost of calling the LLM: {range}</>}>
      ~${(sum / 2).toFixed(2)}
    </Tooltip>
  ) : (
    <>{range}</>
  );

  return (
    <Paragraph
      type="secondary"
      style={{
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {cost}{" "}
      <HelpIcon title={"LLM Cost Estimation"}>
        <Paragraph>
          This chat message mentions a language model or replies in a thread.
          This means, right after sending the message, the message and the
          content of the current thread will be sent to the LLM for processing.
          Then, the LLM will start replying to your message.
        </Paragraph>
        <Paragraph>
          {isFree ? (
            <>This model is free to use.</>
          ) : (
            <>
              The estimate for this call is between ${min.toFixed(2)} and $
              {max.toFixed(2)}.
            </>
          )}
        </Paragraph>
        {ESTIMATION_HELP_TEXT}
      </HelpIcon>
    </Paragraph>
  );
}
