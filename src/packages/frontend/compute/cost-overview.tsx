import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import { ReactNode } from "react";

interface Props {
  cost: number | null;
  description: ReactNode;
  style?;
}

export default function CostOverview({ cost, description, style }: Props) {
  if (cost == null) {
    return null;
  }
  return (
    <div style={{ textAlign: "center", ...style }}>
      <MoneyStatistic
        value={cost}
        title={<b>Total Cost Per Hour While Running</b>}
        costPerMonth={730 * cost}
      />
      <div style={{ color: "#666", maxWidth: "600px", margin: "auto" }}>
        {description}
      </div>
    </div>
  );
}
