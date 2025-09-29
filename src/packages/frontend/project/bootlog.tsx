import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useState } from "react";
import { Progress, Space, Spin } from "antd";
import { useProjectContext } from "./context";
import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import type { Event } from "@cocalc/conat/project/runner/bootlog";
import ShowError from "@cocalc/frontend/components/error";
import { capitalize, plural } from "@cocalc/util/misc";

export default function Bootlog({
  style,
  compute_server_id,
}: {
  compute_server_id?: number;
  style?;
}) {
  const { project_id } = useProjectContext();
  const [log, setLog] = useState<null | Event[]>(null);

  useAsyncEffect(async () => {
    const log = await webapp_client.conat_client.projectBootlog({
      project_id,
      compute_server_id,
    });
    // maximally DUMB for now!
    setLog(log.getAll().reverse());
    log.on("change", () => {
      setLog(log.getAll().reverse());
    });

    return () => {
      // free up reference to the dstream
      log.close();
    };
  }, [project_id, compute_server_id]);

  if (log == null) {
    return <Spin />;
  }
  const newest: { [type: string]: Event } = {};
  for (const x of log) {
    const t = x.type.toLowerCase();
    if (newest[t] == null) {
      newest[t] = x;
    }
    if (x.desc && !newest[t].desc) {
      newest[t].desc = x.desc;
    }
  }
  const types = Object.keys(newest);
  types.sort();

  return (
    <div
      style={{
        maxHeight: "200px",
        minWidth: "600px",
        overflow: "auto",
        background: "white",
        color: "#666",
        ...style,
      }}
    >
      {types.map((type) => (
        <ProgressEntry key={type} {...newest[type]} />
      ))}
    </div>
  );
}

function ProgressEntry({ type, progress, desc, elapsed, error }: Event) {
  return (
    <div>
      <Space>
        <div style={{ width: "150px" }}>{typeToString(type)}</div>
        <Progress style={{ width: "150px" }} percent={progress} />
        <div>
          {desc} ({msToString(elapsed)})
        </div>
      </Space>
      <ShowError error={error} />
    </div>
  );
}

function typeToString(type: string) {
  const x = type.split("-");
  return x.map(capitalize).join(" ");
}

function msToString(t?: number): string {
  if (!t) {
    return " - ";
  }
  if (t < 1000) {
    const n = Math.round(t);
    return `${n} ${plural(n, "millisecond")}`;
  } else if (t < 1000 * 60) {
    const n = Math.round(t / 1000);
    return `${n} ${plural(n, "second")}`;
  } else {
    const n = Math.round(t / 1000 / 60);
    return `${n} ${plural(n, "minute")}`;
  }
}
