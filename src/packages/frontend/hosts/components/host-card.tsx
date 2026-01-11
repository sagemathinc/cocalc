import { Button, Card, Popconfirm, Space, Tag, Tooltip, Typography } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { React } from "@cocalc/frontend/app-framework";
import type { Host, HostCatalog } from "@cocalc/conat/hub/api/hosts";
import {
  STATUS_COLOR,
  getHostOnlineTooltip,
  getHostStatusTooltip,
  isHostOnline,
  isHostTransitioning,
} from "../constants";
import {
  getProviderDescriptor,
  isKnownProvider,
} from "../providers/registry";

type HostCardProps = {
  host: Host;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string, mode: "reboot" | "hard") => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
  onEdit: (host: Host) => void;
  providerCapabilities?: HostCatalog["provider_capabilities"];
  selfHost?: {
    isConnectorOnline: (connectorId?: string) => boolean;
    onSetup: (host: Host) => void;
  };
};

export const HostCard: React.FC<HostCardProps> = ({
  host,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onDetails,
  onEdit,
  providerCapabilities,
  selfHost,
}) => {
  const isDeleted = !!host.deleted;
  const isSelfHost = host.machine?.cloud === "self-host";
  const connectorOnline =
    !isSelfHost ||
    !selfHost?.isConnectorOnline ||
    selfHost.isConnectorOnline(host.region);
  const showConnectorSetup =
    isSelfHost && !connectorOnline && host.status === "off";
  const hostOnline = isHostOnline(host.last_seen);
  const showOnlineTag = host.status === "running" && hostOnline;
  const showStaleTag = host.status === "running" && !hostOnline;
  const showSpinner = isHostTransitioning(host.status);
  const statusLabel = host.deleted ? "deleted" : host.status;
  const startDisabled =
    isDeleted ||
    host.status === "running" ||
    host.status === "starting" ||
    host.status === "restarting" ||
    !connectorOnline;
  const startLabel =
    host.status === "starting"
      ? "Starting"
      : host.status === "restarting"
        ? "Restarting"
        : "Start";
  const stopLabel = host.status === "stopping" ? "Stopping" : "Stop";
  const providerId = host.machine?.cloud;
  const caps = providerId ? providerCapabilities?.[providerId] : undefined;
  const allowStop =
    !isDeleted &&
    (host.status === "running" || host.status === "error") &&
    caps?.supportsStop !== false &&
    host.machine?.storage_mode !== "ephemeral";
  const supportsRestart = caps?.supportsRestart ?? true;
  const supportsHardRestart = caps?.supportsHardRestart ?? false;
  const allowRestart =
    !isDeleted &&
    connectorOnline &&
    (host.status === "running" || host.status === "error") &&
    (supportsRestart || supportsHardRestart);
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
    showConnectorSetup && selfHost ? (
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
    allowRestart ? (
      <Button
        key="restart"
        type="link"
        onClick={() => onRestart(host.id, "reboot")}
      >
        Restart
      </Button>
    ) : (
      <Button key="restart" type="link" disabled>
        Restart
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
        <Space size="small">
          <Tooltip
            title={getHostStatusTooltip(
              host.status,
              Boolean(host.deleted),
              host.provider_observed_at,
            )}
            placement="top"
          >
            <Tag color={host.deleted ? "default" : STATUS_COLOR[host.status]}>
              {showSpinner ? (
                <Space size={4}>
                 <SyncOutlined spin />
                  <span>{statusLabel}</span>
                </Space>
              ) : (
                statusLabel
              )}
            </Tag>
          </Tooltip>
          {showOnlineTag && (
            <Tooltip title={getHostOnlineTooltip(host.last_seen)}>
              <Tag color="green">online</Tag>
            </Tooltip>
          )}
          {showStaleTag && (
            <Tooltip title={getHostOnlineTooltip(host.last_seen)}>
              <Tag color="orange">offline</Tag>
            </Tooltip>
          )}
        </Space>
      }
      actions={actions.filter(Boolean) as React.ReactNode[]}
    >
    <Space direction="vertical" size="small">
        {host.reprovision_required && (
          <Tooltip title="Host config changed while stopped; will reprovision on next start.">
            <Tag color="orange">Reprovision on next start</Tag>
          </Tooltip>
        )}
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
