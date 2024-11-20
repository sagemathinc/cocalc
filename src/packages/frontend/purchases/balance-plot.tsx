import { useMemo, useState } from "react";
import { Card, Spin, Tooltip } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { round2down } from "@cocalc/util/misc";
import { useAsyncEffect } from "use-async-effect";

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
    const x: Date[] = [];
    const y: number[] = [];
    if (data.length > 0) {
      let lastAmount = 0;
      for (const { date, amount: amount0 } of data) {
        const amount = round2down(amount0);
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

  const [Plot, setPlot] = useState<any>(null);
  useAsyncEffect(async () => {
    // load only when actually used, since this involves dynamic load over the internet,
    // and we don't want loading cocalc in an airgapped network to have hung network requests,
    // and this Plot functionality is only used for billing.
    const Plot = (await import("@cocalc/frontend/components/plotly")).default;
    setPlot(Plot);
  }, []);

  const currency = " (US Dollars)";

  if (Plot == null) {
    return <Spin />;
  }

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
