import { useMemo, useState } from "react";
import { Card, Checkbox, Flex } from "antd";
import Plot from "@cocalc/frontend/components/plotly";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  title?;
  data: { date: Date; amount: number }[];
  style?;
}

export default function SpendPlot({ data, title, style }: Props) {
  const [error, setError] = useState<string>("");
  const [cumulative, setCumulative] = useState<boolean>(true);

  const plotData = useMemo(() => {
    const x = data.map(({ date }) => date);
    const y = data.map(({ amount }) => amount);
    if (cumulative) {
      return [
        {
          type: "area",
          x,
          y: cumSum(y),
          name: "Cumulative Cost",
          fill: "tozeroy",
        },
      ];
    } else {
      return [
        {
          type: "bar",
          x,
          y,
          name: "Amount",
        },
      ];
    }
  }, [data, cumulative]);

  const currency = " (US Dollars)";

  return (
    <Card
      style={style}
      title={
        <Flex>
          {(cumulative ? "Total " : "") + ((title ?? " Amount ") + currency)}
          <div style={{ flex: 1 }} />
          <Checkbox
            checked={cumulative}
            onChange={(e) => setCumulative(e.target.checked)}
          >
            Cumulative Amount
          </Checkbox>
        </Flex>
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
            title: (cumulative ? "Cumulative Amount" : "Amount") + currency,
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
