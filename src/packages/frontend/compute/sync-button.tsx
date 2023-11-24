import { useState } from "react";
import { Button, Spin, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  compute_server_id: number;
  project_id: string;
  size?;
  noIcon?: boolean;
  syncing?: boolean;
  time?: number;
  style?;
  type?;
  children?;
}

const MAX_SYNC_TIME_MS = 20000;

export default function SyncButton({
  project_id,
  compute_server_id,
  size,
  syncing,
  time,
  noIcon,
  style,
  type,
  children,
}: Props) {
  const [syncRequest, setSyncRequest] = useState<boolean>(false);
  const isSyncing =
    syncRequest || (syncing && Date.now() <= (time ?? 0) + MAX_SYNC_TIME_MS);
  const [error, setError] = useState<string>("");

  return (
    <Tooltip
      mouseEnterDelay={0.9}
      title={
        <>
          Synchronize files in the HOME directory of the compute server with the
          HOME directory of the project, except excluded directories. You
          usually must explicitly sync files.
        </>
      }
    >
      <>
        <Button
          type={type}
          disabled={isSyncing}
          size={size}
          style={style}
          onClick={async () => {
            try {
              setSyncRequest(true);
              const api = await webapp_client.project_client.api(project_id);
              await api.computeServerSyncRequest(compute_server_id);
            } catch (err) {
              setError(`${err}`);
            } finally {
              setTimeout(() => setSyncRequest(false), 3000);
            }
          }}
        >
          {!noIcon && <Icon name="sync" />} {children ?? "Sync"}
          {isSyncing && (
            <Spin delay={1000} size="small" style={{ marginLeft: "5px" }} />
          )}
        </Button>
        <ShowError error={error} setError={setError} />
      </>
    </Tooltip>
  );
}
