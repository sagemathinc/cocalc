import { Button, Card, Space, Tag, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { STATUS_COLOR } from "../constants";

type HostCardProps = {
  host: Host;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
};

export const HostCard: React.FC<HostCardProps> = ({
  host,
  onStart,
  onStop,
  onDelete,
  onDetails,
}) => (
  <Card
    title={host.name}
    extra={<Tag color={STATUS_COLOR[host.status]}>{host.status}</Tag>}
    actions={[
      <Button
        key="start"
        type="link"
        disabled={host.status === "running"}
        onClick={() => onStart(host.id)}
      >
        Start
      </Button>,
      <Button
        key="stop"
        type="link"
        disabled={host.status !== "running"}
        onClick={() => onStop(host.id)}
      >
        Stop
      </Button>,
      <Button key="details" type="link" onClick={() => onDetails(host)}>
        Details
      </Button>,
      <Button key="delete" type="link" danger onClick={() => onDelete(host.id)}>
        Delete
      </Button>,
    ]}
  >
    <Space direction="vertical" size="small">
      <Typography.Text>Region: {host.region}</Typography.Text>
      <Typography.Text>Size: {host.size}</Typography.Text>
      <Typography.Text>GPU: {host.gpu ? "Yes" : "No"}</Typography.Text>
      <Typography.Text>Projects: {host.projects ?? 0}</Typography.Text>
      {host.last_action && (
        <Typography.Text type="secondary">
          Last action: {host.last_action}
          {host.last_action_status ? ` (${host.last_action_status})` : ""}
          {host.last_action_at
            ? ` · ${new Date(host.last_action_at).toLocaleString()}`
            : ""}
        </Typography.Text>
      )}
      {host.status === "error" && host.error && (
        <Typography.Text type="danger">{host.error}</Typography.Text>
      )}
    </Space>
  </Card>
);
