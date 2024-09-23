import { useEffect, useMemo, useRef, useState } from "react";
import { getMetrics } from "./api";
import type { CloudFilesystemMetric } from "@cocalc/util/db-schema/cloud-filesystems";
import Plot from "@cocalc/frontend/components/plotly";
import { field_cmp } from "@cocalc/util/misc";
import { Button, Spin, Tooltip } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import {
  estimateCost_bytes_used,
  estimateCost,
} from "@cocalc/util/compute/cloud/google-cloud/storage-costs";
import { useGoogleCloudPriceData } from "@cocalc/frontend/compute/api";
import { currency } from "@cocalc/util/misc";
import { markup } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

const GiB = 1024 * 1024 * 1024;
const DIGITS = 4;

export default function Metrics({ id }) {
  const [metrics, setMetrics] = useState<CloudFilesystemMetric[] | null>(null);
  const { val: counter, inc: refresh } = useCounter();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [priceData, priceDataError] = useGoogleCloudPriceData();
  const [error, setError] = useState<string>("");
  const costsRef = useRef<any>({});

  useEffect(() => {
    (async () => {
      let metrics;
      try {
        setRefreshing(true);
        metrics = await getMetrics({ id });
      } catch (err) {
        setError(`${err}`);
      } finally {
        setRefreshing(false);
      }
      setMetrics(metrics.sort(field_cmp("timestamp")));
    })();
  }, [counter]);

  if (metrics == null || priceData == null) {
    return (
      <div style={{ margin: "10px", textAlign: "center" }}>
        Loading Metrics... <Spin />
      </div>
    );
  }

  return (
    <>
      <div>
        <Button style={{ float: "right" }} onClick={refresh}>
          <Icon name="refresh" />
          Refresh{" "}
          {refreshing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>
      </div>
      <ShowError error={error} setError={setError} />
      <ShowError error={priceDataError} />
      <ShowTotal costsRef={costsRef} priceData={priceData} counter={counter} />
      <PlotDiskUsage
        metrics={metrics}
        priceData={priceData}
        costsRef={costsRef}
      />
      <PlotMetric
        metrics={metrics}
        title="Data Uploaded (Network Transfer)"
        label="Data (GB)"
        field={"bytes_put"}
        scale={1 / GiB}
        priceData={priceData}
        costsRef={costsRef}
      />
      <PlotMetric
        metrics={metrics}
        title="Objects Uploaded (Class A Operations)"
        label="Objects"
        field={"objects_put"}
        priceData={priceData}
        costsRef={costsRef}
      />
      <PlotMetric
        metrics={metrics}
        title="Data Downloaded (Network Transfer)"
        label="Data (GB)"
        field={"bytes_get"}
        scale={1 / GiB}
        priceData={priceData}
        costsRef={costsRef}
      />
      <PlotMetric
        metrics={metrics}
        title="Objects Downloaded (Class B Operations)"
        label="Objects"
        field={"objects_get"}
        priceData={priceData}
        costsRef={costsRef}
      />
      {/*<PlotMetric
        metrics={metrics}
        title="Deleted Objects (Class C Operations)"
        label="Deletes"
        field={"objects_delete"}
        priceData={priceData}
        costsRef={costsRef}
      />*/}
      Storage and network usage are calculated in binary gigabytes (GB), also
      known as gibibytes (GiB), where GiB is 1024<sup>3</sup>=2<sup>30</sup>{" "}
      bytes.
    </>
  );
}

function ShowTotal({ costsRef, priceData, counter }) {
  const { inc } = useCounter();
  useEffect(() => {
    // i'm hungry and need to be done with this for now.
    // todo: just compute all the costs first and pass them down
    // instead of using a ref.
    setTimeout(inc, 1);
    setTimeout(inc, 10);
    setTimeout(inc, 500);
  }, [counter]);

  let cost = 0;
  for (const i in costsRef.current) {
    cost += costsRef.current[i];
  }
  return (
    <div>
      <h3>
        Estimated total cost during this period:{" "}
        <Money cost={cost} priceData={priceData} />
      </h3>
      This is the sum of at rest storage, data transfer, and object creation and
      deletion operations. It is only an estimate. See the plots and breakdown
      below.
    </div>
  );
}

function PlotDiskUsage({ metrics, priceData, costsRef }) {
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
  const { cost: v, rate_per_GB_per_month } = estimateCost_bytes_used({
    metrics,
    priceData,
  });
  const cost = v.length > 0 ? v[v.length - 1] : 0;
  costsRef.current.bytes_used = cost;

  return (
    <>
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
      Estimated total at rest data storage cost during this period:{" "}
      <strong>
        <Money cost={cost} priceData={priceData} />
      </strong>
      . This uses a rate of{" "}
      <Money cost={rate_per_GB_per_month} priceData={priceData} /> / GB per
      month. Your actual cost will depend on the exact data stored, compression,
      and other parameters.
    </>
  );
}

function PlotMetric({
  metrics,
  priceData,
  title,
  label,
  field,
  scale = 1,
  style,
  costsRef,
}: {
  metrics: CloudFilesystemMetric[];
  priceData;
  title: string;
  label: string;
  field: string;
  scale?: number;
  style?;
  costsRef;
}) {
  scale = scale ?? 1;
  const cost = useMemo(() => {
    if (priceData == null || metrics == null) {
      return null;
    }
    const c = estimateCost({ field, priceData, metrics });
    if (c != null) {
      costsRef.current[field] = c.cost_min;
    }
    return c;
  }, [priceData, metrics]);
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
    <div style={style}>
      <Plot
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
      <div>
        <ShowCostEstimate cost={cost} priceData={priceData} />
      </div>
    </div>
  );
}

function ShowCostEstimate({ cost, priceData }) {
  if (cost == null) return null;
  const { cost_min: min, cost_max: max, desc } = cost;
  if (min == max) {
    return (
      <div>
        Total cost during this period {desc}:{" "}
        <b>
          <Money cost={max} priceData={priceData} />
        </b>
      </div>
    );
  }
  return (
    <div>
      Total cost during this period {desc}:{" "}
      <b>
        between <Money cost={min} priceData={priceData} /> and{" "}
        <Money cost={max} priceData={priceData} />
      </b>
      . This is a range because there is an active onprem server that might be
      in Australia or China (if not, the cost is the lower value).
    </div>
  );
}

function Money({ cost, priceData }) {
  if (priceData == null) {
    return <>-</>;
  }
  return (
    <Tooltip title={currency(markup({ cost, priceData }), DIGITS)}>
      {currency(markup({ cost, priceData }), 2)}
    </Tooltip>
  );
}
