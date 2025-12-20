import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Divider,
  List,
  Modal,
  Radio,
  Space,
  Tag,
  Typography,
} from "antd";
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

  const grouped = useMemo(() => {
    const groups: { label: string; items: Host[] }[] = [];
    const addGroup = (label: string, items: Host[]) => {
      if (items.length) groups.push({ label, items });
    };

    const owned = hosts.filter((h) => h.scope === "owned");
    const collab = hosts.filter((h) => h.scope === "collab");
    const poolFree = hosts.filter((h) => h.tier === "free" && h.scope === "pool");
    const poolMember = hosts.filter(
      (h) => h.tier === "member" && h.scope === "pool",
    );
    const poolPro = hosts.filter((h) => h.tier === "pro" && h.scope === "pool");

    addGroup("Your hosts", owned);
    addGroup("Collaborator hosts", collab);
    addGroup("Shared pool (free)", poolFree);
    addGroup("Shared pool (member)", poolMember);
    addGroup("Shared pool (pro)", poolPro);

    const items: any[] = [];
    for (const g of groups) {
      items.push({ type: "header", label: g.label });
      items.push(
        ...g.items
          .sort((a, b) => {
            // sort by status then name
            const order = ["running", "starting", "off", "stopping", "deprovisioned"];
            const ai = order.indexOf(a.status);
            const bi = order.indexOf(b.status);
            if (ai !== bi) return ai - bi;
            return (a.name || "").localeCompare(b.name || "");
          })
          .map((h) => ({ type: "host", host: h })),
      );
    }
    return items;
  }, [hosts, currentHostId]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await webapp_client.conat_client.hub.hosts.listHosts({
        catalog: true,
      });
      setHosts(list);
      // default select the first placeable non-current host
      const first = list.find(
        (h) => h.id !== currentHostId && h.can_place !== false,
      );
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
          dataSource={grouped}
          loading={loading}
          locale={{ emptyText: "No available hosts" }}
          renderItem={(item) => {
            if (item.type === "header") {
              return (
                <List.Item style={{ background: "#fafafa" }}>
                  <Typography.Text strong>{item.label}</Typography.Text>
                </List.Item>
              );
            }
            const host = item.host as Host;
            const disabled =
              host.id === currentHostId || host.can_place === false;
            const muted = !host.can_place;
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
                      {host.tier && (
                        <Tag color={host.can_place ? "blue" : "default"}>
                          {host.tier}
                        </Tag>
                      )}
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
                    <Typography.Text type="secondary" italic>
                      {host.reason_unavailable}
                    </Typography.Text>
                  )}
                  {muted && (
                    <Divider style={{ margin: "4px 0" }} dashed />
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
