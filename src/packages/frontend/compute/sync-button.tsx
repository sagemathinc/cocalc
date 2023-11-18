import { useState } from "react";
import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  compute_server_id: number;
  project_id: string;
  size?;
  noIcon?: boolean;
  syncing?: boolean;
}

export default function SyncButton({
  project_id,
  compute_server_id,
  size,
  syncing,
  noIcon,
}: Props) {
  const [syncRequest, setSyncRequest] = useState<boolean>(false);

  return (
    <Button
      disabled={syncRequest || syncing}
      size={size}
      style={{
        marginTop: "3px",
        background: "#5cb85c",
        color: "white",
        opacity: syncRequest || syncing ? 0.65 : undefined,
      }}
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
      {!noIcon && <Icon name="sync" />} Sync
      {(syncRequest || syncing) && (
        <Spin delay={1000} size="small" style={{ marginLeft: "5px" }} />
      )}
    </Button>
  );
}
