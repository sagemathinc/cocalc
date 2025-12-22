import { CSS } from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";
import { LLMUsageStatus } from "@cocalc/frontend/misc/llm-cost-estimation";
import type { CostEstimate } from "./types";

export function LLMCostEstimationChat({
  costEstimate,
  compact: _compact,
  style,
}: {
  costEstimate?: CostEstimate;
  compact: boolean; // only mean is shown
  style?: CSS;
}) {
  if (!costEstimate || _compact) {
    return null;
  }

  return (
    <Paragraph
      type="secondary"
      style={{
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <LLMUsageStatus />
    </Paragraph>
  );
}
