import { Badge, Progress, Descriptions, Typography, Space, Alert } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  DownloadOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import type { ConatConnectionStatus } from "@cocalc/frontend/conat/client";
import { capitalize } from "@cocalc/util/misc";
import { MAX_SUBSCRIPTIONS_PER_CLIENT } from "@cocalc/conat/core/constants";

let MAX_SEND_MESSAGES = 1000,
  MAX_SEND_BYTES = 1_000_000;
let MAX_RECV_MESSAGES = 2000,
  MAX_RECV_BYTES = 10_000_000;

function bytesToStr(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function ConnectionStatsDisplay({
  status,
}: {
  status: ConatConnectionStatus;
}) {
  const connected = status.state === "connected";
  const statusText = connected ? "Connected" : "Disconnected";
  const statusColor = connected ? "green" : "red";

  const icon = connected ? <CheckCircleOutlined /> : <CloseCircleOutlined />;

  if (MAX_SEND_MESSAGES <= status.stats.send.messages) {
    MAX_SEND_MESSAGES += 1_000;
  }
  if (MAX_SEND_BYTES <= status.stats.send.bytes) {
    MAX_SEND_BYTES += 1_000_000;
  }
  if (MAX_RECV_MESSAGES <= status.stats.recv.messages) {
    MAX_RECV_MESSAGES += 1_000;
  }
  if (MAX_RECV_BYTES <= status.stats.recv.bytes) {
    MAX_RECV_BYTES += 1_000_000;
  }

  if (status?.stats == null) {
    return null;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={5}>
        <Badge status={statusColor as any} text={statusText} /> {icon}
      </Typography.Title>

      {!connected && !!status.reason && (
        <Alert
          message={capitalize(status.reason)}
          type="warning"
          showIcon
          style={{ marginBottom: 10 }}
        />
      )}

      <Descriptions bordered size="middle" column={1}>
        <Descriptions.Item
          label={
            <>
              <SendOutlined /> Messages sent
            </>
          }
        >
          <Progress
            percent={Math.min(
              100,
              (100 * status.stats.send.messages) / MAX_SEND_MESSAGES,
            )}
            size="small"
            status="active"
            strokeColor="#1890ff"
            format={() => `${status.stats.send.messages}`}
          />
        </Descriptions.Item>
        <Descriptions.Item label="Bytes sent">
          <Progress
            percent={Math.min(
              100,
              (100 * status.stats.send.bytes) / MAX_SEND_BYTES,
            )}
            size="small"
            status="active"
            strokeColor="#40a9ff"
            format={() => bytesToStr(status.stats.send.bytes)}
          />
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <>
              <DownloadOutlined /> Messages received
            </>
          }
        >
          <Progress
            percent={Math.min(
              100,
              (100 * status.stats.recv.messages) / MAX_RECV_MESSAGES,
            )}
            size="small"
            strokeColor="#52c41a"
            status="active"
            format={() => `${status.stats.recv.messages}`}
          />
        </Descriptions.Item>
        <Descriptions.Item label="Bytes received">
          <Progress
            percent={Math.min(
              100,
              (100 * status.stats.recv.bytes) / MAX_RECV_BYTES,
            )}
            size="small"
            strokeColor="#73d13d"
            status="active"
            format={() => bytesToStr(status.stats.recv.bytes)}
          />
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <>
              <UsergroupAddOutlined /> Subscriptions
            </>
          }
        >
          <Progress
            percent={Math.min(
              100,
              (100 * status.stats.subs) / MAX_SUBSCRIPTIONS_PER_CLIENT,
            )}
            size="small"
            strokeColor="purple"
            status="active"
            format={() => `${status.stats.subs}`}
          />
        </Descriptions.Item>
      </Descriptions>

      {/* Optionally, details debugging */}
      {status.details && (
        <Typography.Paragraph
          copyable
          code
          style={{ maxHeight: 120, overflow: "auto", marginTop: 12 }}
        >
          {JSON.stringify(status.details, null, 2)}
        </Typography.Paragraph>
      )}
    </Space>
  );
}
