import { useEffect, useMemo, useState } from "react";
import { getMetrics } from "./api";
import type { CloudFilesystemMetric } from "@cocalc/util/db-schema/cloud-filesystems";
import Plot from "@cocalc/frontend/components/plotly";
import { field_cmp } from "@cocalc/util/misc";

export default function Metrics({ id }) {
  const [metrics, setMetrics] = useState<CloudFilesystemMetric[] | null>(null);
  useEffect(() => {
    (async () => {
      let metrics = await getMetrics({ id });
      metrics = MOCK_DATA;
      setMetrics(metrics.sort(field_cmp("timestamp")));
    })();
  }, []);

  if (metrics == null) {
    return null;
  }

  return (
    <>
      <PlotUploads metrics={metrics} />
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

function PlotUploads({ metrics }) {
  const data = useMemo(() => {
    if (metrics == null) {
      return [];
    }
    let total_bytes_put = 0;
    let state: {
      [id: number]: { bytes_put: number; process_uptime: number };
    } = {};

    const x: Date[] = [];
    const y: number[] = [];
    for (const {
      compute_server_id,
      timestamp,
      bytes_put = 0,
      process_uptime,
    } of metrics) {
      if (
        state[compute_server_id] != null &&
        state[compute_server_id].process_uptime < process_uptime
      ) {
        total_bytes_put += bytes_put - state[compute_server_id].bytes_put;
      }
      state[compute_server_id] = {
        bytes_put,
        process_uptime,
      };
      x.push(new Date(timestamp));
      y.push(total_bytes_put / GiB);
    }

    return [{ x, y, type: "scatter" }];
  }, [metrics]);

  return (
    <Plot
      data={data}
      layout={{
        title: "Uploaded Data",
        xaxis: {
          title: "Time",
        },
        yaxis: {
          title: "Uploaded Data (GB)",
        },
      }}
    />
  );
}

const MOCK_DATA = [{}] as CloudFilesystemMetric[];
