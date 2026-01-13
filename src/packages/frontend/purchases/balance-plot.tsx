import { useMemo, useState } from "react";
import { Card, Tooltip } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { moneyRound2Down, type MoneyValue } from "@cocalc/util/money";
import Plot from "@cocalc/frontend/components/plotly";

interface Props {
  title?;
  data: { date: Date; amount: MoneyValue }[];
  style?;
  description?;
}

export default function BalancePlot({
  data,
  title,
  description,
  style,
}: Props) {
  const [error, setError] = useState<string>("");

  const plotData = useMemo(() => {
    const x: Date[] = [];
    const y: number[] = [];
    if (data.length > 0) {
      let lastAmount = 0;
      for (const { date, amount: amount0 } of data) {
        const amount = moneyRound2Down(amount0).toNumber();
        x.push(date);
        y.push(lastAmount);
        x.push(date);
        y.push(amount);
        lastAmount = amount;
      }
    }
    return [
      {
        type: "area",
        x,
        y,
        name: "Balance",
        fill: "tozeroy",
      },
    ];
  }, [data]);

  const currency = " (US Dollars)";

  return (
    <Card
      style={style}
      title={<Tooltip title={description}>{title ?? " Balance"}</Tooltip>}
    >
      <br />
      <Plot
        data={plotData}
        layout={{
          xaxis: {
            title: "Date",
          },
          yaxis: {
            title: "Balance" + currency,
          },
        }}
      />
      <ShowError error={error} setError={setError} />
    </Card>
  );
}
