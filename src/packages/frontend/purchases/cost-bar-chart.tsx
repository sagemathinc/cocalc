import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
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

  return (
    <SettingBox icon="line-chart" title="Total Spend by Day">
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
      {costPerDay != null && <PlotCostPerDay costPerDay={costPerDay} />}
      {error && (
        <Alert type="error" description={error} onClose={updateData} closable />
      )}
    </SettingBox>
  );
}

function PlotCostPerDay({ costPerDay }) {
  const dates = costPerDay.map((point) => point.date);
  const totalCosts = costPerDay.map((point) => point.total_cost);

  const plotData = [
    {
      type: "bar",
      x: dates,
      y: totalCosts,
    },
  ];

  return (
    <Plot
      data={plotData}
      layout={{
        title: "Total Spend by Day",
        xaxis: {
          title: "Date",
        },
        yaxis: {
          title: "Total Cost",
        },
      }}
    />
  );
}
