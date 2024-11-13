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

export default function BalancePlot({
  data,
  title,
  description,
  style,
}: Props) {
  const [error, setError] = useState<string>("");

  const plotData = useMemo(() => {
    const x = data.map(({ date }) => date);
    const y = data.map(({ amount }) => amount);
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
