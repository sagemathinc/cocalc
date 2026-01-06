import { Button, Card, Popconfirm, Space, Tag, Typography } from "antd";
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
  selfHost?: {
    isConnectorOnline: (connectorId?: string) => boolean;
    onSetup: (host: Host) => void;
  };
};

export const HostCard: React.FC<HostCardProps> = ({
  host,
  onStart,
  onStop,
  onDelete,
  onDetails,
  onEdit,
  selfHost,
}) => {
  const isDeleted = !!host.deleted;
  const isSelfHost = host.machine?.cloud === "self-host";
  const connectorOnline =
    !isSelfHost ||
    !selfHost?.isConnectorOnline ||
    selfHost.isConnectorOnline(host.region);
  const startDisabled =
    isDeleted ||
    host.status === "running" ||
    host.status === "starting" ||
    !connectorOnline;
  const startLabel = host.status === "starting" ? "Starting" : "Start";
  const stopLabel = host.status === "stopping" ? "Stopping" : "Stop";
  const statusValue = host.status as Host["status"] | "active";
  const allowStop =
    !isDeleted &&
    (statusValue === "running" ||
      statusValue === "active" ||
      statusValue === "error");
  const deleteLabel = isDeleted
    ? "Deleted"
    : host.status === "deprovisioned"
      ? "Delete"
      : "Deprovision";
  const deleteTitle =
    host.status === "deprovisioned"
      ? "Delete this host?"
      : "Deprovision this host?";
  const deleteOkText = host.status === "deprovisioned" ? "Delete" : "Deprovision";
  const actions = [
    <Button
      key="start"
      type="link"
      disabled={startDisabled}
      onClick={() => onStart(host.id)}
    >
      {startLabel}
    </Button>,
    isSelfHost && !connectorOnline && selfHost ? (
      <Button
        key="setup"
        type="link"
        onClick={() => selfHost.onSetup(host)}
      >
        Setup
      </Button>
    ) : null,
    allowStop ? (
      <Popconfirm
        key="stop"
        title="Stop this host?"
        okText="Stop"
        cancelText="Cancel"
        onConfirm={() => onStop(host.id)}
      >
        <Button type="link">{stopLabel}</Button>
      </Popconfirm>
    ) : (
      <Button key="stop" type="link" disabled>
        {stopLabel}
      </Button>
    ),
    <Button
      key="edit"
      type="link"
      disabled={isDeleted}
      onClick={() => onEdit(host)}
    >
      Edit
    </Button>,
    <Button key="details" type="link" onClick={() => onDetails(host)}>
      Details
    </Button>,
    <Popconfirm
      key="delete"
      title={deleteTitle}
      okText={deleteOkText}
      cancelText="Cancel"
      okButtonProps={{ danger: true }}
      onConfirm={() => onDelete(host.id)}
      disabled={isDeleted}
    >
      <Button type="link" danger disabled={isDeleted}>
        {deleteLabel}
      </Button>
    </Popconfirm>,
  ];

  return (
    <Card
      title={host.name}
      extra={
        <Tag color={host.deleted ? "default" : STATUS_COLOR[host.status]}>
          {host.deleted ? "deleted" : host.status}
        </Tag>
      }
      actions={actions.filter(Boolean) as React.ReactNode[]}
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
      <Typography.Text>
        {isSelfHost ? "Connector" : "Region"}: {host.region}
      </Typography.Text>
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
        <div
          style={{
            maxHeight: "4.8em",
            overflowY: "auto",
            color: "#c00",
            fontSize: 12,
            lineHeight: 1.2,
            whiteSpace: "pre-wrap",
            paddingRight: 4,
          }}
        >
          {host.last_error}
        </div>
      )}
    </Space>
    </Card>
  );
};
