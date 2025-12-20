import { useEffect, useState } from "react";
import { Button, List, Modal, Radio, Space, Tag, Typography } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { Icon } from "@cocalc/frontend/components/icon";

const STATUS_COLOR = {
  stopped: "red",
  off: "red",
  running: "green",
  starting: "blue",
  stopping: "orange",
  provisioning: "blue",
  deprovisioned: "default",
} as const;

export function HostPickerModal({
  open,
  onCancel,
  onSelect,
  currentHostId,
}: {
  open: boolean;
  currentHostId?: string;
  onCancel: () => void;
  onSelect: (host_id: string) => void;
}) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();

  const load = async () => {
    setLoading(true);
    try {
      const list = await webapp_client.conat_client.hub.hosts.listHosts({
        catalog: true,
      });
      setHosts(list);
      // default select the first placeable non-current host
      const first = list.find((h) => h.id !== currentHostId && h.can_place !== false);
      setSelected((prev) => prev ?? first?.id);
    } catch (err) {
      console.error("failed to load hosts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load().catch(console.error);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={() => selected && onSelect(selected)}
      okButtonProps={{ disabled: !selected, loading }}
      title={
        <Space>
          <Icon name="server" /> Move to host
        </Space>
      }
      destroyOnClose
    >
      <Typography.Paragraph type="secondary">
        Pick a project host to move this project to. Files in{" "}
        <code>/scratch</code> (if any) will be discarded.
      </Typography.Paragraph>
      <div style={{ marginBottom: 8 }}>
        <Button size="small" onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>
      <Radio.Group
        style={{ width: "100%" }}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <List
          bordered
          dataSource={hosts}
          loading={loading}
          locale={{ emptyText: "No available hosts" }}
          renderItem={(host) => {
            const disabled = host.id === currentHostId || host.can_place === false;
            return (
              <List.Item>
                <Space
                  direction="vertical"
                  style={{ width: "100%" }}
                  size="small"
                >
                  <Space
                    align="center"
                    style={{ width: "100%", justifyContent: "space-between" }}
                  >
                    <Space>
                      <Radio value={host.id} disabled={disabled}>
                        {host.name}
                      </Radio>
                      <Tag color={STATUS_COLOR[host.status] ?? "default"}>
                        {host.status}
                      </Tag>
                      {host.tier && <Tag>{host.tier}</Tag>}
                    </Space>
                    <Space>
                      <Tag>{host.region}</Tag>
                      <Tag>{host.size}</Tag>
                      {host.gpu && <Tag color="purple">GPU</Tag>}
                    </Space>
                  </Space>
                  <Typography.Text type="secondary">
                    Projects: {host.projects ?? 0}
                  </Typography.Text>
                  {host.id === currentHostId && (
                    <Typography.Text type="secondary">
                      This project is already on this host.
                    </Typography.Text>
                  )}
                  {host.can_place === false && host.reason_unavailable && (
                    <Typography.Text type="secondary">
                      {host.reason_unavailable}
                    </Typography.Text>
                  )}
                </Space>
              </List.Item>
            );
          }}
        />
      </Radio.Group>
    </Modal>
  );
}
