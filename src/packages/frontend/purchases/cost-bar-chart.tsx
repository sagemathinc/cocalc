import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Spin } from "antd";
import Plot from "react-plotly.js";
import { SettingBox } from "@cocalc/frontend/components/setting-box";

const LIMIT = 60; // ~2 months

interface DailyCost {
  date: Date;
  total_cost: number;
}

export default function CostBarChart({}) {
  const [costPerDay, setCostPerDay] = useState<DailyCost[] | null>(null);
  const [error, setError] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const [cumulative, setCumulative] = useState<boolean>(false);

  const updateData = async () => {
    try {
      const x = await webapp_client.purchases_client.getCostPerDay({
        limit: LIMIT,
        offset,
      });
      setCostPerDay(x);
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    updateData();
  }, [offset]);

  function createPlotData(costPerDay: DailyCost[]) {
    if (cumulative) {
      const dates = costPerDay.map((point) => point.date);
      const dateToCost: { [date: number]: number } = {};
      dates.sort();
      for (const { date, total_cost } of costPerDay) {
        dateToCost[date.valueOf()] = total_cost;
      }
      const x: Date[] = [];
      const y: number[] = [];
      let sum = 0;
      for (const date of dates) {
        sum += dateToCost[date.valueOf()];
        x.push(date);
        y.push(sum);
      }
      return [
        {
          type: "area",
          x,
          y,
          name: "Cumulative Cost",
          fill: "tozeroy",
        },
      ];
    } else {
      return [
        {
          type: "bar",
          x: costPerDay.map((point) => point.date),
          y: costPerDay.map((point) => point.total_cost),
          name: "Daily Cost",
        },
      ];
    }
  }

  return (
    <SettingBox
      icon="line-chart"
      title={<span style={{ marginLeft: "5px" }}>Spend</span>}
    >
      <Checkbox
        checked={cumulative}
        onChange={(e) => setCumulative(e.target.checked)}
      >
        Show Cumulative Spend
      </Checkbox>
      <br />
      {costPerDay != null && (
        <Button.Group style={{ float: "right" }}>
          <Button
            disabled={costPerDay.length < LIMIT}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Older
          </Button>
          <Button
            disabled={offset == 0}
            onClick={() => setOffset(offset - LIMIT)}
          >
            Newer
          </Button>
        </Button.Group>
      )}
      {costPerDay == null && <Spin delay={500} />}
      {costPerDay != null && (
        <Plot
          data={createPlotData(costPerDay)}
          layout={{
            title: cumulative ? "Cumulative Spend" : "Spend Each Day",
            xaxis: {
              title: "Date",
            },
            yaxis: {
              title: cumulative ? "Cumulative Cost" : "Total Cost",
            },
            width: 800,
          }}
        />
      )}
      {error && (
        <Alert type="error" description={error} onClose={updateData} closable />
      )}
    </SettingBox>
  );
}
