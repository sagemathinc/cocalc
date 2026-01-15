import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useState } from "react";
import { Progress, Space, Spin, Switch, Tooltip } from "antd";
import { useProjectContext } from "./context";
import { redux, useAsyncEffect } from "@cocalc/frontend/app-framework";
import type { LroEvent, LroScopeType } from "@cocalc/conat/hub/api/lro";
import ShowError from "@cocalc/frontend/components/error";
import { capitalize, field_cmp, plural } from "@cocalc/util/misc";
import { namespaceToColor } from "@cocalc/util/color";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { TimeAgo } from "@cocalc/frontend/components";
import type { StartLroState } from "./start-ops";

type ProgressEvent = {
  type: string;
  progress?: number;
  error?: string;
  desc?: string;
  elapsed?: number;
  speed?: string;
  eta?: number;
};

export default function Bootlog({
  style,
  lro,
}: {
  style?;
  lro?: {
    op_id: string;
    scope_type: LroScopeType;
    scope_id: string;
  };
}) {
  const { project_id, isRunning } = useProjectContext();
  const [log, setLog] = useState<null | ProgressEvent[]>(null);
  const [rawBootlog, setRawBootlog] = useState<boolean>(
    !!localStorage.rawBootlog,
  );
  const startLro = redux.useProjectStore(
    (store) => store?.get("start_lro")?.toJS() as StartLroState | undefined,
    project_id,
  );
  const fallbackLro =
    startLro?.summary != null
      ? {
          op_id: startLro.summary.op_id,
          scope_type: startLro.summary.scope_type,
          scope_id: startLro.summary.scope_id,
        }
      : startLro?.op_id
        ? {
            op_id: startLro.op_id,
            scope_type: "project" as const,
            scope_id: project_id,
          }
        : undefined;
  const resolvedLro = lro ?? fallbackLro;

  useAsyncEffect(async () => {
    if (!resolvedLro?.op_id) {
      setLog(null);
      return;
    }
    const stream = await webapp_client.conat_client.lroStream({
      op_id: resolvedLro.op_id,
      scope_type: resolvedLro.scope_type,
      scope_id: resolvedLro.scope_id,
    });
    const update = () => {
      const events = stream.getAll();
      setLog(convertLroEvents(events));
    };
    update();
    stream.on("change", update);
    return () => {
      stream.close();
    };
  }, [
    resolvedLro?.op_id,
    resolvedLro?.scope_type,
    resolvedLro?.scope_id,
  ]);

  if (!resolvedLro?.op_id) {
    return null;
  }
  if (log == null) {
    return <Spin />;
  }
  const newest: { [type: string]: ProgressEvent } = {};
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
}: ProgressEvent & { isRunning?: boolean }) {
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

function convertLroEvents(events: LroEvent[]): ProgressEvent[] {
  const out: ProgressEvent[] = [];
  const hasNonQueued = events.some(
    (event) =>
      event.type === "progress" &&
      (event.phase ?? "progress").toLowerCase() !== "queued",
  );
  for (const event of events) {
    if (event.type !== "progress") {
      continue;
    }
    const phase = event.phase ?? "progress";
    if (hasNonQueued && phase.toLowerCase() === "queued") {
      continue;
    }
    const detail = event.detail ?? {};
    out.push({
      type: phase,
      desc: event.message,
      progress: event.progress,
      elapsed: detail.elapsed,
      speed: detail.speed,
      eta: detail.eta,
      error: detail.error,
    });
  }
  return out.reverse();
}
