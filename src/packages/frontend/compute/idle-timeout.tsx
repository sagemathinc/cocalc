import { useEffect, useState } from "react";
import { useServer } from "./compute-server";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);
import { InputNumber, Tooltip } from "antd";
import { useInterval } from "react-interval-hook";
import { IDLE_TIMEOUT_DEFAULT_MINUTES } from "@cocalc/util/db-schema/compute-servers";
import { AutomaticShutdownCard, saveComputeServer } from "./automatic-shutdown";

export function IdleTimeout({
  id,
  project_id,
  help,
}: {
  id: number;
  project_id: string;
  help?: boolean;
}) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [enabled, setEnabled] = useState<boolean>(!!server.idle_timeout);
  const [idle_timeout, set_idle_timeout] = useState<number | null>(
    server.idle_timeout ?? null,
  );
  useEffect(() => {
    set_idle_timeout(server.idle_timeout);
  }, [server.idle_timeout]);

  return (
    <AutomaticShutdownCard
      title="Idle Timeout"
      icon="stopwatch"
      setEnabled={(enabled) => {
        setEnabled(enabled);
        if (enabled) {
          set_idle_timeout(IDLE_TIMEOUT_DEFAULT_MINUTES);
        } else {
          set_idle_timeout(0);
        }
      }}
      save={async () => {
        await saveComputeServer({
          id,
          project_id,
          idle_timeout,
        });
      }}
      savable={(server.idle_timeout ?? 0) != idle_timeout}
      savedEnabled={server.idle_timeout}
      enabled={enabled}
      saving={saving}
      setSaving={setSaving}
      error={error}
      setError={setError}
    >
      <IdleTimeoutMessage minimal project_id={project_id} id={id} />
      {help && (
        <div style={{ marginBottom: "15px" }}>
          <p>
            <IdleTimeoutMessage project_id={project_id} id={id} />
          </p>
          <p>
            Automatically stop the compute server if no terminal or file (e.g.,
            Jupyter notebook) on this compute server is used through the main
            CoCalc web interface for a given numbers of minutes. CPU and GPU
            usage is not taken into account.
          </p>
          <ul>
            <li>
              Idle timeout for compute servers has no direct impact on their
              cost. Indirectly, setting an idle timeout can save you a huge
              amount of money, depending on your usage patterns!
            </li>
            <li>
              Compute server idle timeout is unrelated to your home base's idle
              timeout. Any time a compute server is running, it keeps the home
              base project running, which effectively gives the home base a long
              idle timeout.
            </li>
          </ul>
        </div>
      )}
      <div style={{ textAlign: "center" }}>
        <InputNumber
          style={{ width: "300px" }}
          disabled={saving || !enabled}
          min={0}
          step={15}
          value={idle_timeout}
          onChange={(value) => set_idle_timeout(value)}
          addonAfter="timeout minutes"
          placeholder="Idle timeout..."
        />
      </div>
    </AutomaticShutdownCard>
  );
}

interface Props {
  id: number;
  project_id: string;
  style?;
  minimal?: boolean;
}

export function IdleTimeoutMessage({ id, project_id, style, minimal }: Props) {
  const server = useServer({ id, project_id });
  const [counter, setCounter] = useState<number>(0);
  useInterval(() => {
    setCounter(counter + 1);
  }, 5000);

  if (!server) {
    return null;
  }
  const { state, last_edited_user, idle_timeout } = server;
  if (!idle_timeout || state != "running" || !last_edited_user) {
    return null;
  }
  const last = dayjs(last_edited_user);
  const date = last.add(idle_timeout, "minutes");
  const mesg = (
    <>
      Server will stop <TimeAgo date={date.toDate()} /> unlesss somebody
      actively edits.
    </>
  );
  if (!minimal) {
    return <div style={style}>{mesg}</div>;
  }

  let d = date.diff(dayjs());
  const formattedDiff = dayjs.duration(d).format("HH:mm:ss");
  return (
    <Tooltip title={<>Idle Timeout: {mesg}</>}>
      <div style={style}>{formattedDiff}</div>
    </Tooltip>
  );
}
