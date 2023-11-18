import { useState } from "react";
import { Button, Spin, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  compute_server_id: number;
  project_id: string;
  size?;
  noIcon?: boolean;
  syncing?: boolean;
  style?;
  type?;
  children?;
}

export default function SyncButton({
  project_id,
  compute_server_id,
  size,
  syncing,
  noIcon,
  style,
  type,
  children,
}: Props) {
  const [syncRequest, setSyncRequest] = useState<boolean>(false);

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
      <Button
        type={type}
        disabled={syncRequest || syncing}
        size={size}
        style={style}
        onClick={async () => {
          try {
            setSyncRequest(true);
            const api = await webapp_client.project_client.api(project_id);
            await api.computeServerSyncRequest(compute_server_id);
          } finally {
            setTimeout(() => setSyncRequest(false), 3000);
          }
        }}
      >
        {!noIcon && <Icon name="sync" />} {children ?? "Sync"}
        {(syncRequest || syncing) && (
          <Spin delay={1000} size="small" style={{ marginLeft: "5px" }} />
        )}
      </Button>
    </Tooltip>
  );
}
