import { Alert, Button, Card, Divider, Drawer, Space, Tag, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import Bootlog from "@cocalc/frontend/project/bootlog";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "../hooks/use-host-log";
import { STATUS_COLOR } from "../constants";
import {
  getProviderDescriptor,
  isKnownProvider,
} from "../providers/registry";

type HostDrawerViewModel = {
  open: boolean;
  host?: Host;
  onClose: () => void;
  onEdit: (host: Host) => void;
  hostLog: HostLogEntry[];
  loadingLog: boolean;
};

export const HostDrawer: React.FC<{ vm: HostDrawerViewModel }> = ({ vm }) => {
  const { open, host, onClose, onEdit, hostLog, loadingLog } = vm;
  return (
  <Drawer
    title={
      <Space>
        <Icon name="server" /> {host?.name ?? "Host details"}
        {host && (
          <Tag color={STATUS_COLOR[host.status]}>{host.status}</Tag>
        )}
        {host && (
          <Button type="link" size="small" onClick={() => onEdit(host)}>
            Edit
          </Button>
        )}
      </Space>
    }
    width={640}
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
          <Tag>{host.region}</Tag>
          <Tag>{host.size}</Tag>
          {host.gpu && <Tag color="purple">GPU</Tag>}
        </Space>
        <Typography.Text copyable={{ text: host.id }}>
          Host ID: {host.id}
        </Typography.Text>
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
          {(host.machine?.source_image ||
            host.machine?.metadata?.source_image) && (
            <Typography.Text>
              Image:{" "}
              {host.machine?.source_image ??
                host.machine?.metadata?.source_image}
            </Typography.Text>
          )}
        </Space>
        <Typography.Text>Projects: {host.projects ?? 0}</Typography.Text>
        <Typography.Text type="secondary">
          Last seen: {host.last_seen ?? "n/a"}
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
                    <div style={{ color: "#c00", fontSize: 12 }}>
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
