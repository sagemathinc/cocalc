import { Button, Divider, Modal, Space, Tabs, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type SelfHostRemoveModalProps = {
  open: boolean;
  host?: Host;
  onCancel: () => void;
  onRemove: () => void;
};

const codeStyle: React.CSSProperties = {
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
};

export const SelfHostRemoveModal: React.FC<SelfHostRemoveModalProps> = ({
  open,
  host,
  onCancel,
  onRemove,
}) => {
  const vmName = host?.id ? `cocalc-host-${host.id}` : "<vm-name>";
  const linuxCommands = `cocalc-self-host-connector stop
systemctl --user disable --now cocalc-self-host-connector.service
rm -f ~/.config/systemd/user/cocalc-self-host-connector.service
rm -rf ~/.config/cocalc-connector

# remove the binary
rm -f ~/.local/bin/cocalc-self-host-connector
sudo rm -f /usr/local/bin/cocalc-self-host-connector

# optional: delete the VM
multipass delete --purge ${vmName}
multipass purge`;
  const macCommands = `cocalc-self-host-connector stop
launchctl unload ~/Library/LaunchAgents/com.cocalc.self-host-connector.plist
rm -f ~/Library/LaunchAgents/com.cocalc.self-host-connector.plist
rm -rf ~/.config/cocalc-connector
sudo rm -f /usr/local/bin/cocalc-self-host-connector

# optional: delete the VM
multipass delete --purge ${vmName}
multipass purge`;

  return (
    <Modal
      open={open}
      title="Remove self-hosted connector"
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="remove" danger type="primary" onClick={onRemove}>
          Mark removed in CoCalc
        </Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Paragraph>
          Run the commands below on your computer to remove the connector and (optionally)
          delete the VM. After that, click “Mark removed in CoCalc”.
        </Typography.Paragraph>
        <Divider style={{ margin: "8px 0" }} />
        <Tabs
          defaultActiveKey="linux"
          items={[
            {
              key: "linux",
              label: "Linux",
              children: (
                <Typography.Paragraph copyable={{ text: linuxCommands }}>
                  <pre style={codeStyle}>{linuxCommands}</pre>
                </Typography.Paragraph>
              ),
            },
            {
              key: "mac",
              label: "macOS",
              children: (
                <Typography.Paragraph copyable={{ text: macCommands }}>
                  <pre style={codeStyle}>{macCommands}</pre>
                </Typography.Paragraph>
              ),
            },
          ]}
        />
        <Typography.Paragraph type="secondary">
          If you no longer have access to the computer, use “Force deprovision” instead.
        </Typography.Paragraph>
      </Space>
    </Modal>
  );
};
