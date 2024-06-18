import { useEffect, useMemo, useState } from "react";
import { getMetrics } from "./api";
import type { CloudFilesystemMetric } from "@cocalc/util/db-schema/cloud-filesystems";
import Plot from "@cocalc/frontend/components/plotly";
import { field_cmp } from "@cocalc/util/misc";
import { Spin } from "antd";

const GiB = 1024 * 1024 * 1024;

export default function Metrics({ id }) {
  const [metrics, setMetrics] = useState<CloudFilesystemMetric[] | null>(null);
  useEffect(() => {
    (async () => {
      let metrics = await getMetrics({ id });
      setMetrics(metrics.sort(field_cmp("timestamp")));
    })();
  }, []);

  if (metrics == null) {
    return (
      <div style={{ margin: "10px", textAlign: "center" }}>
        Loading Metrics... <Spin />
      </div>
    );
  }

  return (
    <>
      <PlotDiskUsage metrics={metrics} />
      <div style={{ display: "flex" }}>
        <PlotMetric
          style={{ flex: 1 }}
          metrics={metrics}
          title="Uploaded Data"
          label="Uploaded Data (GB)"
          field={"bytes_put"}
          scale={1 / GiB}
        />
        <PlotMetric
          style={{ flex: 1 }}
          metrics={metrics}
          title="Objects Uploaded"
          label="Uploads"
          field={"objects_put"}
        />
      </div>
      <div style={{ display: "flex" }}>
        <PlotMetric
          style={{ flex: 1 }}
          metrics={metrics}
          title="Downloaded Data"
          label="Downloaded Data (GB)"
          field={"bytes_get"}
          scale={1 / GiB}
        />
        <PlotMetric
          style={{ flex: 1 }}
          metrics={metrics}
          title="Objects Downloaded"
          label="Downloads"
          field={"objects_get"}
        />
        {/*<PlotMetric
          style={{ flex: 1 }}
          metrics={metrics}
          title="Deleted Objects"
          labels="Deletes"
          field={"objects_delete"}
        />*/}
      </div>
      Storage and network usage are calculated in binary gigabytes (GB), also
      known as gibibytes (GiB), where GiB is 1024<sup>3</sup>=2<sup>30</sup>{" "}
      bytes.
    </>
  );
}

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
        title: "Total Disk Space Used",
        xaxis: {
          title: "Time",
        },
        yaxis: {
          title: "Disk Used (GB)",
        },
      }}
    />
  );
}

function PlotMetric({
  metrics,
  title,
  label,
  field,
  scale = 1,
  style,
}: {
  metrics: CloudFilesystemMetric[];
  title: string;
  label: string;
  field: string;
  scale?: number;
  style?;
}) {
  scale = scale ?? 1;
  const data = useMemo(() => {
    if (metrics == null) {
      return [];
    }
    let total = 0;
    let state: {
      [id: number]: { value: number; process_uptime: number };
    } = {};

    const x: Date[] = [];
    const y: number[] = [];
    for (const {
      compute_server_id,
      timestamp,
      // @ts-ignore
      [field]: value = 0,
      process_uptime,
    } of metrics) {
      if (
        state[compute_server_id] != null &&
        state[compute_server_id].process_uptime < process_uptime
      ) {
        total += value - state[compute_server_id].value;
      }
      state[compute_server_id] = {
        value,
        process_uptime,
      };
      x.push(new Date(timestamp));
      y.push(total * scale);
    }

    return [{ x, y, type: "scatter" }];
  }, [metrics]);

  return (
    <Plot
      style={style}
      data={data}
      layout={{
        title,
        xaxis: {
          title: "Time",
        },
        yaxis: {
          title: label,
        },
      }}
    />
  );
}
