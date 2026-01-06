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
  const safeName =
    connector?.name?.trim() ||
    host?.name?.trim() ||
    `connector-${connectorId}`;
  const quoteShell = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const installCommand = token
    ? `curl -fsSL https://software.cocalc.ai/software/self-host/install.sh | \\\n  bash -s -- --base-url ${base} --token ${token} --name ${quoteShell(safeName)}`
    : undefined;

  React.useEffect(() => {
    if (!open || !expires) return;
    const ts = Date.parse(expires);
    if (!Number.isFinite(ts)) return;
    const delayMs = Math.max(ts - Date.now() - 1000, 0);
    const timer = window.setTimeout(() => {
      onRefresh();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [open, expires, onRefresh]);

  return (
    <Modal
      open={open}
      title="Set up your self-hosted connector"
      onCancel={onCancel}
      footer={[
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
        <Typography.Paragraph type="secondary">
          Supported on macOS and Linux only (Windows support is planned).
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
          2) Copy/paste this command:
        </Typography.Paragraph>
        {loading && (
          <Typography.Text type="secondary">
            Creating pairing token…
          </Typography.Text>
        )}
        {error && <Alert type="error" message={error} showIcon />}
        {installCommand && (
          <>
            <Typography.Paragraph copyable={{ text: installCommand }}>
              <pre
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  background: "#f5f5f5",
                  border: "1px solid #e6e6e6",
                  borderRadius: 6,
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                }}
              >
                {installCommand}
              </pre>
            </Typography.Paragraph>
            {expires && (
              <Typography.Paragraph type="secondary">
                Token expires: {new Date(expires).toLocaleString()}
              </Typography.Paragraph>
            )}
            <Typography.Paragraph type="secondary">
              Logs:
              <br />
              Linux:{" "}
              <Typography.Text code>
                journalctl --user -u cocalc-self-host-connector.service -f
              </Typography.Text>
              <br />
              macOS:{" "}
              <Typography.Text code>
                ~/Library/Logs/cocalc-self-host-connector.log
              </Typography.Text>
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              Manual start/stop (if needed):{" "}
              <Typography.Text code>cocalc-self-host-connector run --daemon</Typography.Text>
              {" / "}
              <Typography.Text code>cocalc-self-host-connector stop</Typography.Text>
            </Typography.Paragraph>
          </>
        )}
        <Typography.Paragraph type="secondary">
          The connector will start immediately and your host will auto-start once it connects.
          Run only one connector per computer.
        </Typography.Paragraph>
      </Space>
    </Modal>
  );
};
