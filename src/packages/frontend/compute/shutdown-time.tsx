import { useState } from "react";
import { useServer } from "./compute-server";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { TimePicker, Tooltip } from "antd";
import { useInterval } from "react-interval-hook";
import { AutomaticShutdownCard } from "./automatic-shutdown";
import { setServerConfiguration } from "./api";
import {
  type ShutdownTime,
  validatedShutdownTime,
  DEFAULT_SHUTDOWN_TIME,
} from "@cocalc/util/db-schema/compute-servers";
import { isEqual } from "lodash";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);

export function ShutdownTime({
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
  const [shutdownTime, setShutdownTime] = useState<Partial<ShutdownTime>>(
    server.configuration?.shutdownTime ?? DEFAULT_SHUTDOWN_TIME,
  );

  return (
    <AutomaticShutdownCard
      title="Shutdown Time"
      icon="PoweroffOutlined"
      setEnabled={(enabled) => {
        setShutdownTime({ ...shutdownTime, enabled });
      }}
      save={async () => {
        await setServerConfiguration({
          id,
          configuration: {
            shutdownTime: validatedShutdownTime(shutdownTime),
          },
        });
      }}
      hasUnsavedChanges={
        !isEqual(
          server.configuration?.shutdownTime ?? DEFAULT_SHUTDOWN_TIME,
          shutdownTime,
        ) && shutdownTime.epochMs != null
      }
      savedEnabled={!!server.configuration?.shutdownTime?.enabled}
      enabled={shutdownTime.enabled}
      saving={saving}
      setSaving={setSaving}
      error={error}
      setError={setError}
    >
      <ShutdownTimeMessage minimal project_id={project_id} id={id} />
      {help && (
        <div style={{ marginBottom: "15px" }}>
          <p>
            <ShutdownTimeMessage project_id={project_id} id={id} />
          </p>
          <p>
            Automatically stop the compute server at the specified time every
            day.
          </p>
        </div>
      )}
      <div style={{ textAlign: "center" }}>
        <TimePicker
          use12Hours
          defaultValue={
            shutdownTime.epochMs == null
              ? null
              : dayjs(new Date(shutdownTime.epochMs))
          }
          onChange={(time) =>
            setShutdownTime({
              ...shutdownTime,
              epochMs: time?.toDate().valueOf(),
            })
          }
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

export function ShutdownTimeMessage({ id, project_id, style, minimal }: Props) {
  const server = useServer({ id, project_id });
  const [counter, setCounter] = useState<number>(0);
  useInterval(() => {
    setCounter(counter + 1);
  }, 5000);

  if (!server) {
    return null;
  }
  const { state } = server;
  if (state != "running") {
    return null;
  }
  const shutdownTime = validatedShutdownTime(
    server.configuration?.shutdownTime,
  );
  if (!shutdownTime?.enabled) {
    return null;
  }
  const date = nextShutdown(dayjs(shutdownTime.epochMs)).toDate();
  const mesg = (
    <>
      Server currently scheduled to shutdown <TimeAgo date={date} />.
    </>
  );
  if (!minimal) {
    return <div style={style}>{mesg}</div>;
  }

  return (
    <Tooltip title={mesg}>
      <div style={{ whiteSpace: "nowrap", ...style }}>
        {date.toLocaleTimeString()}
      </div>
    </Tooltip>
  );
}

function nextShutdown(t: dayjs.Dayjs): dayjs.Dayjs {
  const now = dayjs();
  let targetTime = now.hour(t.hour()).minute(t.minute()).second(t.second());

  if (targetTime.isBefore(now.subtract(3, "minutes"))) {
    targetTime = targetTime.add(1, "day");
  }

  return targetTime;
}
