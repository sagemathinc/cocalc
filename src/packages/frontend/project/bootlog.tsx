import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useState } from "react";
import { Progress, Space, Spin, Switch, Tooltip } from "antd";
import { useProjectContext } from "./context";
import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import type { Event } from "@cocalc/conat/project/runner/bootlog";
import ShowError from "@cocalc/frontend/components/error";
import { capitalize, field_cmp, plural } from "@cocalc/util/misc";
import { namespaceToColor } from "@cocalc/util/color";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { TimeAgo } from "@cocalc/frontend/components";
import Save from "./save";

export default function Bootlog({
  style,
  compute_server_id,
}: {
  compute_server_id?: number;
  style?;
}) {
  const { project_id, isRunning } = useProjectContext();
  const [log, setLog] = useState<null | Event[]>(null);
  const [rawBootlog, setRawBootlog] = useState<boolean>(
    !!localStorage.rawBootlog,
  );

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
  const data = Object.values(newest);
  data.sort(field_cmp("elapsed"));
  data.reverse();

  return (
    <div
      style={{
        maxHeight: "300px",
        minWidth: "600px",
        maxWidth: "800px",
        overflow: "auto",
        background: "white",
        color: "#666",
        ...style,
      }}
    >
      {data.map((event) => (
        <ProgressEntry key={event.type} isRunning={isRunning} {...event} />
      ))}
      <Space style={{ margin: "5px 0" }}>
        <Switch
          unCheckedChildren="Log"
          checked={rawBootlog}
          onChange={(checked) => {
            setRawBootlog(checked);
            if (checked) {
              localStorage.rawBootlog = "true";
            } else {
              delete localStorage.rawBootlog;
            }
          }}
        />
        {rawBootlog && <> Boot Log</>}
      </Space>

      {rawBootlog && (
        <StaticMarkdown
          value={
            "```js\n" + log.map((x) => JSON.stringify(x)).join("\n") + "\n```\n"
          }
        />
      )}
    </div>
  );
}

function ProgressEntry({
  type,
  progress,
  desc,
  elapsed,
  error,
  isRunning,
}: Event & { isRunning?: boolean }) {
  const remaining = estimateRemainingTime({ elapsed, progress });
  return (
    <div>
      <Tooltip
        title={
          <>
            {typeToString(type)}
            <br />
            Elapsed: {msToString(elapsed)}
            {remaining ? (
              <>
                <br />
                ETA: <TimeAgo date={new Date(Date.now() + remaining)} />
              </>
            ) : null}
          </>
        }
      >
        <Space>
          <div style={{ width: "150px" }}>{typeToString(type)}</div>
          <Progress
            style={{ width: "150px" }}
            percent={progress}
            strokeColor={namespaceToColor(type)}
          />
          <div>
            {desc}
            {remaining ? (
              <>
                {" "}
                (ETA: <TimeAgo date={new Date(Date.now() + remaining)} />)
              </>
            ) : null}
          </div>
        </Space>
      </Tooltip>
      {error && <hr />}
      {isRunning && error && type == "save-rootfs" && (
        <Save rootfs home={false} />
      )}
      {isRunning && error && type == "save-home" && (
        <Save home rootfs={false} />
      )}
      <ShowError error={error} style={{ margin: "10px 0" }} />
    </div>
  );
}

// elapsed is a number of ms since the task started
// progress is a number between 0 and 100 recording how much we have accomplished
function estimateRemainingTime({
  elapsed,
  progress,
}: {
  elapsed?: number;
  progress?: number;
}): number | undefined {
  if (elapsed == null || progress == null) {
    return undefined;
  }
  if (elapsed < 2000 || progress <= 2) {
    return undefined;
  }
  if (progress == 100) {
    return 0;
  }
  const timePerUnit = elapsed / progress;
  return Math.round((100 - progress) * timePerUnit);
}

function typeToString(type: string) {
  const x = type.split("-");
  return x.map(capitalize).join(" ");
}

function msToString(t?: number): string {
  if (!t) {
    return "";
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
