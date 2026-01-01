import { Button, Card, Space, Tag, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { STATUS_COLOR } from "../constants";
import {
  getProviderDescriptor,
  isKnownProvider,
} from "../providers/registry";

type HostCardProps = {
  host: Host;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
  onEdit: (host: Host) => void;
};

export const HostCard: React.FC<HostCardProps> = ({
  host,
  onStart,
  onStop,
  onDelete,
  onDetails,
  onEdit,
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
      <Button key="edit" type="link" onClick={() => onEdit(host)}>
        Edit
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
      <Typography.Text>
        Provider:{" "}
        {host.machine?.cloud
          ? isKnownProvider(host.machine.cloud)
            ? getProviderDescriptor(host.machine.cloud).label
            : host.machine.cloud
          : "n/a"}
      </Typography.Text>
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
      {host.status === "error" && host.last_error && (
        <Typography.Text type="danger">{host.last_error}</Typography.Text>
      )}
    </Space>
  </Card>
);
