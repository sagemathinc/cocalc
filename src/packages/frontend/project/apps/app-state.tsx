import { useAppStatus } from "./use-app-status";
import { Button, Space, Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { useEffect } from "react";
import AppStatus from "./app-status";

export default function AppState({
  name,
  setUrl,
  autoStart,
}: {
  name: string;
  setUrl: (url: string | undefined) => void;
  autoStart: boolean;
}) {
  const { status, error, setError, loading, refresh, start, stop } =
    useAppStatus({
      name,
    });

  useEffect(() => {
    if (autoStart && status?.state != "running") {
      start();
    }
  }, [name, autoStart]);

  useEffect(() => {
    setUrl(status?.state == "running" && status?.url ? status.url : undefined);
  }, [status]);

  if (status == null && !error) {
    return <Spin />;
  }
  return (
    <div>
      <ShowError error={error} setError={setError} />
      <Space.Compact>
        <Button onClick={() => start()}>Start</Button>
        <Button disabled={status?.state != "running"} onClick={() => stop()}>
          Stop
        </Button>
        {loading && <Spin />}
      </Space.Compact>
      <Button onClick={() => refresh()} style={{ float: "right" }}>
        Refresh
      </Button>
      {status != null && <AppStatus status={status} />}
    </div>
  );
}
