import { useEffect, useMemo, useState } from "react";
import { getMetrics } from "./api";
import type { CloudFilesystemMetric } from "@cocalc/util/db-schema/cloud-filesystems";
import Plot from "@cocalc/frontend/components/plotly";

export default function Metrics({ id }) {
  const [metrics, setMetrics] = useState<CloudFilesystemMetric[] | null>(null);
  useEffect(() => {
    (async () => {
      setMetrics(await getMetrics({ id }));
      setMetrics(MOCK_DATA);
    })();
  }, []);

  if (metrics == null) {
    return null;
  }

  return (
    <>
      <PlotDiskUsage metrics={metrics} />

      <pre style={{ overflow: "auto", maxHeight: "50vh" }}>
        {JSON.stringify(metrics, undefined, 2)}
      </pre>
    </>
  );
}

const GiB = 1024 * 1024 * 1024;

function PlotDiskUsage({ metrics }) {
  const data = useMemo(() => {
    if (metrics == null) {
      return [];
    }
    return [
      {
        x: metrics.map(({ timestamp }) => new Date(timestamp)),
        y: metrics.map(({ bytes_used }) => bytes_used / GiB),
        type: "scatter",
      },
    ];
  }, [metrics]);

  return (
    <Plot
      data={data}
      layout={{
        title: "Disk Usage",
        xaxis: {
          title: "Time",
        },
        yaxis: {
          title: "Disk Usage (GB)",
        },
      }}
    />
  );
}

const MOCK_DATA = [{}] as CloudFilesystemMetric[];
