import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from "antd";
import { React } from "@cocalc/frontend/app-framework";
import Bootlog from "@cocalc/frontend/project/bootlog";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "../hooks/use-host-log";
import { STATUS_COLOR } from "../constants";
import { getProviderDescriptor, isKnownProvider } from "../providers/registry";

type HostDrawerViewModel = {
  open: boolean;
  host?: Host;
  onClose: () => void;
  onEdit: (host: Host) => void;
  onUpgrade?: (host: Host) => void;
  canUpgrade?: boolean;
  hostLog: HostLogEntry[];
  loadingLog: boolean;
  selfHost?: {
    connectorMap: Map<
      string,
      { id: string; name?: string; last_seen?: string }
    >;
    isConnectorOnline: (connectorId?: string) => boolean;
    onSetup: (host: Host) => void;
    onRemove: (host: Host) => void;
    onForceDeprovision: (host: Host) => void;
  };
};

export const HostDrawer: React.FC<{ vm: HostDrawerViewModel }> = ({ vm }) => {
  const {
    open,
    host,
    onClose,
    onEdit,
    onUpgrade,
    canUpgrade,
    hostLog,
    loadingLog,
    selfHost,
  } = vm;
  const isSelfHost = host?.machine?.cloud === "self-host";
  const readPositive = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  };
  const selfHostCpu = readPositive(host?.machine?.metadata?.cpu);
  const selfHostRam = readPositive(host?.machine?.metadata?.ram_gb);
  const selfHostDisk = readPositive(host?.machine?.disk_gb);
  const showSelfHostResources =
    isSelfHost && (selfHostCpu || selfHostRam || selfHostDisk);
  const connectorOnline =
    !isSelfHost ||
    !selfHost?.isConnectorOnline ||
    selfHost.isConnectorOnline(host?.region);
  const showConnectorWarning =
    isSelfHost && !!host && !connectorOnline && host.status === "off";
  const connectorLabel = isSelfHost
    ? `Connector: ${host?.region ?? "n/a"}`
    : host?.region;
  const connectorStatusTag = isSelfHost ? (
    <Tag color={connectorOnline ? "green" : "red"}>
      {connectorOnline ? "Connector online" : "Connector offline"}
    </Tag>
  ) : null;
  const canForceDeprovision =
    !!host &&
    isSelfHost &&
    !host.deleted &&
    host.status !== "deprovisioned";
  return (
    <Drawer
      resizable
      title={
        <Space>
          <Icon name="server" /> {host?.name ?? "Host details"}
          {host && (
            <Tag color={host.deleted ? "default" : STATUS_COLOR[host.status]}>
              {host.deleted ? "deleted" : host.status}
            </Tag>
          )}
          {host && (
            <Button
              type="link"
              size="small"
              disabled={!!host.deleted}
              onClick={() => onEdit(host)}
            >
              Edit
            </Button>
          )}
        </Space>
      }
      onClose={onClose}
      open={open && !!host}
    >
      {host ? (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Space size="small">
            <Tag>
              {host.machine?.cloud
                ? isKnownProvider(host.machine.cloud)
                  ? getProviderDescriptor(host.machine.cloud).label
                  : host.machine.cloud
                : "provider: n/a"}
            </Tag>
            <Tag>{connectorLabel}</Tag>
            {connectorStatusTag}
            <Tag>{host.size}</Tag>
            {host.gpu && <Tag color="purple">GPU</Tag>}
          </Space>
          <Typography.Text copyable={{ text: host.id }}>
            Host ID: {host.id}
          </Typography.Text>
          {isSelfHost && host.region && (
            <Typography.Text copyable={{ text: host.region }}>
              Connector ID: {host.region}
            </Typography.Text>
          )}
          <Space direction="vertical" size="small">
            {host.machine?.cloud && host.public_ip && (
              <Typography.Text copyable={{ text: host.public_ip }}>
                Public IP: {host.public_ip}
              </Typography.Text>
            )}
            {host.machine?.zone && (
              <Typography.Text>Zone: {host.machine.zone}</Typography.Text>
            )}
            {host.machine?.machine_type && (
              <Typography.Text>
                Machine type: {host.machine.machine_type}
              </Typography.Text>
            )}
            {host.machine?.gpu_type && (
              <Typography.Text>
                GPU type: {host.machine.gpu_type}
              </Typography.Text>
            )}
            {showSelfHostResources && (
              <Typography.Text>
                Resources:{" "}
                {selfHostCpu ?? "?"} vCPU / {selfHostRam ?? "?"} GB RAM /{" "}
                {selfHostDisk ?? "?"} GB disk
              </Typography.Text>
            )}
          </Space>
          <Typography.Text>Projects: {host.projects ?? 0}</Typography.Text>
          {(host.version ||
            host.project_bundle_version ||
            host.tools_version) && (
            <Space direction="vertical" size="small">
              <Typography.Text strong>Software</Typography.Text>
              {host.version && (
                <Typography.Text>Project host: {host.version}</Typography.Text>
              )}
              {host.project_bundle_version && (
                <Typography.Text>
                  Project bundle: {host.project_bundle_version}
                </Typography.Text>
              )}
              {host.tools_version && (
                <Typography.Text>Tools: {host.tools_version}</Typography.Text>
              )}
            </Space>
          )}
          {showConnectorWarning && selfHost && (
            <Alert
              type="warning"
              showIcon
              message="Connector offline"
              description={
                <Button size="small" onClick={() => selfHost.onSetup(host)}>
                  Set up connector
                </Button>
              }
            />
          )}
          {isSelfHost && selfHost && !host.deleted && (
            <Space direction="vertical" size="small">
              <Typography.Text strong>Connector actions</Typography.Text>
              <Space wrap>
                <Button size="small" onClick={() => selfHost.onSetup(host)}>
                  Setup or reconnect
                </Button>
                <Button size="small" danger onClick={() => selfHost.onRemove(host)}>
                  Remove connector
                </Button>
                {canForceDeprovision && (
                  <Popconfirm
                    title="Force deprovision this host without contacting your machine?"
                    okText="Force deprovision"
                    cancelText="Cancel"
                    onConfirm={() => selfHost.onForceDeprovision(host)}
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small">Force deprovision</Button>
                  </Popconfirm>
                )}
              </Space>
            </Space>
          )}
          {canUpgrade && host && !host.deleted && onUpgrade && (
            <Popconfirm
              title="Upgrade host software to latest?"
              okText="Upgrade"
              cancelText="Cancel"
              onConfirm={() => onUpgrade(host)}
            >
              <Button size="small">Upgrade software</Button>
            </Popconfirm>
          )}
          <Typography.Text type="secondary">
            Last seen:{" "}
            {host.last_seen ? new Date(host.last_seen).toLocaleString() : "n/a"}
          </Typography.Text>
          {host.status === "error" && host.last_error && (
            <Alert
              type="error"
              showIcon
              message="Provisioning error"
              description={host.last_error}
            />
          )}
          <Divider />
          <Typography.Title level={5}>Recent actions</Typography.Title>
          {loadingLog ? (
            <Typography.Text type="secondary">Loading…</Typography.Text>
          ) : hostLog.length === 0 ? (
            <Typography.Text type="secondary">No actions yet.</Typography.Text>
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size="small">
              {hostLog.map((entry) => (
                <Card
                  key={entry.id}
                  size="small"
                  bodyStyle={{ padding: "10px 12px" }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontWeight: 600 }}>
                      {entry.action} — {entry.status}
                    </div>
                    <div style={{ color: "#888", fontSize: 12 }}>
                      {entry.ts
                        ? new Date(entry.ts).toLocaleString()
                        : "unknown time"}
                    </div>
                    {entry.error && (
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
                        {entry.error}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </Space>
          )}
          <Divider />
          <Typography.Title level={5}>Activity</Typography.Title>
          <Bootlog host_id={host.id} style={{ maxWidth: "100%" }} />
        </Space>
      ) : (
        <Typography.Text type="secondary">
          Select a host to see details.
        </Typography.Text>
      )}
    </Drawer>
  );
};
