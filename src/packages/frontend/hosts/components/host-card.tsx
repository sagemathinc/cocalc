import { Button, Card, Popconfirm, Space, Tag, Tooltip, Typography } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { React } from "@cocalc/frontend/app-framework";
import type { Host, HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostDeleteOptions, HostStopOptions } from "../types";
import { labels } from "@cocalc/frontend/i18n";
import { useIntl } from "react-intl";
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
import { isHostOpActive, type HostLroState } from "../hooks/use-host-ops";
import { getHostOpPhase, HostOpProgress } from "./host-op-progress";
import { HostBackupStatus } from "./host-backup-status";
import { confirmHostDeprovision, confirmHostStop } from "./host-confirm";

type HostCardProps = {
  host: Host;
  hostOp?: HostLroState;
  onStart: (id: string) => void;
  onStop: (id: string, opts?: HostStopOptions) => void;
  onRestart: (id: string, mode: "reboot" | "hard") => void;
  onDelete: (id: string, opts?: HostDeleteOptions) => void;
  onCancelOp?: (op_id: string) => void;
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
  hostOp,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onCancelOp,
  onDetails,
  onEdit,
  providerCapabilities,
  selfHost,
}) => {
  const intl = useIntl();
  const projectsLabel = intl.formatMessage(labels.projects);
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
  const hostOpActive = isHostOpActive(hostOp);
  const startDisabled =
    isDeleted ||
    host.status === "running" ||
    host.status === "starting" ||
    host.status === "restarting" ||
    !connectorOnline ||
    hostOpActive;
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
    host.machine?.storage_mode !== "ephemeral" &&
    !hostOpActive;
  const supportsRestart = caps?.supportsRestart ?? true;
  const supportsHardRestart = caps?.supportsHardRestart ?? false;
  const allowRestart =
    !isDeleted &&
    connectorOnline &&
    (host.status === "running" || host.status === "error") &&
    (supportsRestart || supportsHardRestart) &&
    !hostOpActive;
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
  const isDeprovisioned = host.status === "deprovisioned";
  const opPhase = getHostOpPhase(hostOp);
  const canCancelBackups =
    !!hostOp?.op_id && hostOpActive && opPhase === "backups" && !!onCancelOp;
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
        disabled={hostOpActive}
        onClick={() => selfHost.onSetup(host)}
      >
        Setup
      </Button>
    ) : null,
    allowStop ? (
      <Button
        key="stop"
        type="link"
        onClick={() =>
          confirmHostStop({
            hostName: host.name ?? "Host",
            onConfirm: (opts) => onStop(host.id, opts),
          })
        }
      >
        {stopLabel}
      </Button>
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
    canCancelBackups && hostOp ? (
      <Popconfirm
        key="cancel"
        title="Cancel backups for this host?"
        okText="Cancel backups"
        cancelText="Keep running"
        onConfirm={() => onCancelOp?.(hostOp.op_id)}
      >
        <Button type="link">Cancel</Button>
      </Popconfirm>
    ) : null,
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
    isDeprovisioned ? (
      <Popconfirm
        key="delete"
        title={deleteTitle}
        okText={deleteOkText}
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
        onConfirm={() => onDelete(host.id)}
        disabled={isDeleted || hostOpActive}
      >
        <Button type="link" danger disabled={isDeleted || hostOpActive}>
          {deleteLabel}
        </Button>
      </Popconfirm>
    ) : (
      <Button
        key="delete"
        type="link"
        danger
        disabled={isDeleted || hostOpActive}
        onClick={() =>
          confirmHostDeprovision({
            host,
            onConfirm: (opts) => onDelete(host.id, opts),
          })
        }
      >
        {deleteLabel}
      </Button>
    ),
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
        <HostOpProgress op={hostOp} compact />
        <HostBackupStatus host={host} />
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
        <Typography.Text>
          {projectsLabel}: {host.projects ?? 0}
        </Typography.Text>
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
