import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Popover,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { React } from "@cocalc/frontend/app-framework";
import Bootlog from "@cocalc/frontend/project/bootlog";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "../hooks/use-host-log";
import { mapCloudRegionToR2Region, R2_REGION_LABELS } from "@cocalc/util/consts";
import {
  STATUS_COLOR,
  getHostOnlineTooltip,
  getHostStatusTooltip,
  isHostOnline,
  isHostTransitioning,
} from "../constants";
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

type HostConfigSpec = {
  cloud?: string | null;
  name?: string | null;
  region?: string | null;
  zone?: string | null;
  machine_type?: string | null;
  gpu_type?: string | null;
  gpu_count?: number | null;
  cpu?: number | null;
  ram_gb?: number | null;
  disk_gb?: number | null;
  disk_type?: string | null;
  storage_mode?: string | null;
};

type HostConfigSpecEnvelope = {
  before?: HostConfigSpec;
  after?: HostConfigSpec;
};

const SPEC_LABELS: Record<keyof HostConfigSpec, string> = {
  cloud: "Provider",
  name: "Name",
  region: "Region",
  zone: "Zone",
  machine_type: "Machine",
  gpu_type: "GPU",
  gpu_count: "GPU count",
  cpu: "CPU",
  ram_gb: "RAM",
  disk_gb: "Disk",
  disk_type: "Disk type",
  storage_mode: "Storage",
};

const normalizeSpecValue = (
  key: keyof HostConfigSpec,
  value: HostConfigSpec[keyof HostConfigSpec],
): string => {
  if (value == null || value === "") return "none";
  if (key === "ram_gb" || key === "disk_gb") return `${value} GB`;
  if (key === "cpu") return `${value} vCPU`;
  return String(value);
};

const extractSpecEnvelope = (
  spec: HostLogEntry["spec"],
): HostConfigSpecEnvelope | null => {
  if (!spec || typeof spec !== "object") return null;
  const envelope = spec as HostConfigSpecEnvelope;
  if (!envelope.before && !envelope.after) return null;
  return envelope;
};

const describeSpecChange = (
  spec: HostLogEntry["spec"],
): { summary?: string; details?: string } => {
  const envelope = extractSpecEnvelope(spec);
  if (!envelope?.before || !envelope?.after) return {};
  const changes: string[] = [];
  for (const key of Object.keys(SPEC_LABELS) as Array<keyof HostConfigSpec>) {
    const before = normalizeSpecValue(key, envelope.before[key]);
    const after = normalizeSpecValue(key, envelope.after[key]);
    if (before !== after) {
      changes.push(`${SPEC_LABELS[key]} ${before} → ${after}`);
    }
  }
  if (!changes.length) return {};
  const summary =
    changes.length > 3
      ? `${changes.slice(0, 3).join(", ")}, +${changes.length - 3} more`
      : changes.join(", ");
  const details = JSON.stringify(envelope, null, 2);
  return { summary, details };
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
  const backupRegion =
    host?.region && host.machine?.cloud !== "self-host"
      ? mapCloudRegionToR2Region(host.region)
      : undefined;
  const backupRegionLabel = backupRegion
    ? R2_REGION_LABELS[backupRegion] ?? backupRegion
    : undefined;
  const connectorStatusTag = isSelfHost ? (
    <Tag color={connectorOnline ? "green" : "red"}>
      {connectorOnline ? "Connector online" : "Connector offline"}
    </Tag>
  ) : null;
  const hostOnline = !!host && isHostOnline(host.last_seen);
  const showOnlineTag = host?.status === "running" && hostOnline;
  const showStaleTag = host?.status === "running" && !hostOnline;
  const showSpinner = host ? isHostTransitioning(host.status) : false;
  const statusLabel = host ? (host.deleted ? "deleted" : host.status) : "";
  const onlineTag =
    host && !host.deleted ? (
      showOnlineTag ? (
        <Tooltip title={getHostOnlineTooltip(host.last_seen)}>
          <Tag color="green">online</Tag>
        </Tooltip>
      ) : showStaleTag ? (
        <Tooltip title={getHostOnlineTooltip(host.last_seen)}>
          <Tag color="default">offline</Tag>
        </Tooltip>
      ) : null
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
            <Tooltip
              title={getHostStatusTooltip(
                host.status,
                Boolean(host.deleted),
                host.provider_observed_at,
              )}
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
          )}
          {onlineTag}
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
            {backupRegionLabel && <Tag>Backup region: {backupRegionLabel}</Tag>}
            {connectorStatusTag}
            <Tag>{host.size}</Tag>
            {host.gpu && <Tag color="purple">GPU</Tag>}
            {host.reprovision_required && (
              <Tooltip title="Host config changed while stopped; will reprovision on next start.">
                <Tag color="orange">Reprovision on next start</Tag>
              </Tooltip>
            )}
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
                <Typography.Text>Workspace host: {host.version}</Typography.Text>
              )}
              {host.project_bundle_version && (
                <Typography.Text>
                  Workspace bundle: {host.project_bundle_version}
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
                  {(() => {
                    const change = describeSpecChange(entry.spec);
                    const showDetails = !!change.details;
                    const detailLink = showDetails ? (
                      <Popover
                        title="Config changes"
                        content={
                          <pre style={{ margin: 0, fontSize: 11 }}>
                            {change.details}
                          </pre>
                        }
                      >
                        <a style={{ marginLeft: 8 }}>Details</a>
                      </Popover>
                    ) : null;
                    return (
                      <>
                        {change.summary && (
                          <div style={{ fontSize: 12, marginBottom: 6 }}>
                            Config updated: {change.summary}
                            {detailLink}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontWeight: 600 }}>
                      {entry.action} — {entry.status}
                    </div>
                    {entry.provider && (
                      <div style={{ color: "#666", fontSize: 12 }}>
                        Provider: {entry.provider}
                      </div>
                    )}
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
