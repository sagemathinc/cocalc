import { useMemo, useState } from "react";
import { Card, Tooltip } from "antd";
import Plot from "@cocalc/frontend/components/plotly";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  title?;
  data: { date: Date; amount: number }[];
  style?;
  description?;
}

export default function SpendPlot({ data, title, description, style }: Props) {
  const [error, setError] = useState<string>("");

  const plotData = useMemo(() => {
    const x = data.map(({ date }) => date);
    const y = data.map(({ amount }) => amount);
    return [
      {
        type: "area",
        x,
        y: cumSum(y),
        name: "Cost",
        fill: "tozeroy",
      },
    ];
  }, [data]);

  const currency = " (US Dollars)";

  return (
    <Card
      style={style}
      title={
        <Tooltip title={description}>
          {title ?? " Amount"}
        </Tooltip>
      }
    >
      <br />
      <Plot
        data={plotData}
        layout={{
          xaxis: {
            title: "Date",
          },
          yaxis: {
            title: "Amount" + currency,
          },
        }}
      />
      <ShowError error={error} setError={setError} />
    </Card>
  );
}

function cumSum(z: number[]) {
  const v: number[] = [];
  let t = 0;
  for (const a of z) {
    t += a;
    v.push(t);
  }
  return v;
}
