import { Alert, Button, Divider, Modal, Space, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type ConnectorInfo = {
  id: string;
  name?: string;
  last_seen?: string;
};

type SelfHostSetupModalProps = {
  open: boolean;
  host?: Host;
  connector?: ConnectorInfo;
  baseUrl: string;
  token?: string;
  expires?: string;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onRefresh: () => void;
};

export const SelfHostSetupModal: React.FC<SelfHostSetupModalProps> = ({
  open,
  host,
  connector,
  baseUrl,
  token,
  expires,
  loading,
  error,
  onCancel,
  onRefresh,
}) => {
  const connectorId = connector?.id ?? host?.region ?? "n/a";
  const connectorName = connector?.name ? `${connector.name} (${connectorId})` : connectorId;
  const lastSeen = connector?.last_seen
    ? new Date(connector.last_seen).toLocaleString()
    : undefined;
  const base = baseUrl || "<base-url>";
  const pairCommand = token
    ? `cocalc-self-host-connector pair --base-url ${base} --token ${token}`
    : undefined;
  const runCommand = "cocalc-self-host-connector run";

  return (
    <Modal
      open={open}
      title="Set up your self-hosted connector"
      onCancel={onCancel}
      footer={[
        <Button key="refresh" onClick={onRefresh} loading={loading}>
          Refresh token
        </Button>,
        <Button key="close" type="primary" onClick={onCancel}>
          Done
        </Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Paragraph>
          This connector manages a dedicated VM on your machine using Multipass
          (free, open-source, and easy to install).
        </Typography.Paragraph>
        <Typography.Paragraph>
          Connector ID: <Typography.Text code>{connectorName}</Typography.Text>
        </Typography.Paragraph>
        {lastSeen && (
          <Typography.Paragraph type="secondary">
            Last seen: {lastSeen}
          </Typography.Paragraph>
        )}
        <Divider style={{ margin: "8px 0" }} />
        <Typography.Paragraph>
          1) Install Multipass:{" "}
          <Typography.Link
            href="https://canonical.com/multipass"
            target="_blank"
            rel="noreferrer"
          >
            https://canonical.com/multipass
          </Typography.Link>
        </Typography.Paragraph>
        <Typography.Paragraph>
          2) Pair your connector:
        </Typography.Paragraph>
        {loading && (
          <Typography.Text type="secondary">
            Creating pairing token…
          </Typography.Text>
        )}
        {error && <Alert type="error" message={error} showIcon />}
        {token && (
          <>
            <Typography.Paragraph copyable={{ text: token }}>
              Pairing token: <Typography.Text code>{token}</Typography.Text>
            </Typography.Paragraph>
            {expires && (
              <Typography.Paragraph type="secondary">
                Expires: {new Date(expires).toLocaleString()}
              </Typography.Paragraph>
            )}
            {pairCommand && (
              <Typography.Paragraph copyable={{ text: pairCommand }}>
                <Typography.Text code>{pairCommand}</Typography.Text>
              </Typography.Paragraph>
            )}
          </>
        )}
        <Typography.Paragraph>
          3) Start the connector daemon:
        </Typography.Paragraph>
        <Typography.Paragraph copyable={{ text: runCommand }}>
          <Typography.Text code>{runCommand}</Typography.Text>
        </Typography.Paragraph>
      </Space>
    </Modal>
  );
};
