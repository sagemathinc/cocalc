import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Divider,
  Dropdown,
  List,
  Modal,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { Icon } from "@cocalc/frontend/components/icon";
import { mapCloudRegionToR2Region, R2_REGION_LABELS } from "@cocalc/util/consts";

import { getHostStatusTooltip } from "./constants";

const STATUS_COLOR = {
  stopped: "red",
  off: "red",
  running: "green",
  starting: "blue",
  restarting: "blue",
  stopping: "orange",
  provisioning: "blue",
  deprovisioned: "default",
} as const;

export function HostPickerModal({
  open,
  onCancel,
  onSelect,
  currentHostId,
  regionFilter,
  lockRegion,
}: {
  open: boolean;
  currentHostId?: string;
  onCancel: () => void;
  onSelect: (host_id: string, host?: Host) => void;
  regionFilter?: string;
  lockRegion?: boolean;
}) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [regionFilterState, setRegionFilterState] = useState<string | undefined>(
    regionFilter,
  );

  const grouped = useMemo(() => {
    const groups: { label: string; items: Host[] }[] = [];
    const addGroup = (label: string, items: Host[]) => {
      if (items.length) groups.push({ label, items });
    };

    const filtered = hosts.filter((h) => {
      if (!showUnavailable && h.can_place === false) return false;
      if (
        regionFilterState &&
        mapCloudRegionToR2Region(h.region) !== regionFilterState
      )
        return false;
      return true;
    });

    const current = filtered.filter((h) => h.id === currentHostId);
    const owned = filtered.filter((h) => h.scope === "owned" && h.id !== currentHostId);
    const collab = filtered.filter((h) => h.scope === "collab" && h.id !== currentHostId);
    const pool = filtered.filter(
      (h) => h.scope === "pool" && h.id !== currentHostId,
    );
    const poolByTier = new Map<number, Host[]>();
    for (const host of pool) {
      const tier = host.tier ?? 0;
      const list = poolByTier.get(tier) ?? [];
      list.push(host);
      poolByTier.set(tier, list);
    }

    addGroup("Current host", current);
    addGroup(`Your hosts (${owned.length})`, owned);
    addGroup(`Collaborator hosts (${collab.length})`, collab);
    for (const tier of Array.from(poolByTier.keys()).sort((a, b) => a - b)) {
      const items = poolByTier.get(tier) ?? [];
      addGroup(`Shared pool (tier ${tier}) (${items.length})`, items);
    }

    const items: any[] = [];
    for (const g of groups) {
      items.push({ type: "header", label: g.label });
      items.push(
        ...g.items
          .sort((a, b) => {
            // sort by status then name
            const order = [
              "running",
              "starting",
              "restarting",
              "off",
              "stopping",
              "deprovisioned",
            ];
            const ai = order.indexOf(a.status);
            const bi = order.indexOf(b.status);
            if (ai !== bi) return ai - bi;
            return (a.name || "").localeCompare(b.name || "");
          })
          .map((h) => ({ type: "host", host: h })),
      );
    }
    return items;
  }, [hosts, currentHostId, showUnavailable, regionFilterState]);

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    for (const host of hosts) {
      const mapped = mapCloudRegionToR2Region(host.region);
      if (mapped) regions.add(mapped);
    }
    return Array.from(regions);
  }, [hosts]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await webapp_client.conat_client.hub.hosts.listHosts({
        catalog: true,
      });
      setHosts(list);
      // default select the first placeable non-current host
      const first =
        list.find((h) => h.id === currentHostId) ??
        list.find((h) => h.id !== currentHostId && h.can_place !== false);
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
      if (regionFilter) {
        setRegionFilterState(regionFilter);
      }
    }
  }, [open, regionFilter]);

  return (
    <Modal
      width={600}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        if (!selected) return;
        const host = hosts.find((h) => h.id === selected);
        onSelect(selected, host);
      }}
      okButtonProps={{ disabled: !selected, loading }}
      title={
        <Space>
          <Icon name="server" /> Move to host
        </Space>
      }
      destroyOnClose
    >
      <Typography.Paragraph type="secondary">
        Pick a workspace host to move this workspace to. Files in{" "}
        <code>/scratch</code> (if any) will be discarded.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" onClick={load} loading={loading}>
          Refresh
        </Button>
        <Button
          size="small"
          onClick={() => setShowUnavailable((v) => !v)}
          type={showUnavailable ? "primary" : "default"}
        >
          {showUnavailable ? "Hide unavailable" : "Show unavailable"}
        </Button>
        {!lockRegion && (
          <Dropdown
            menu={{
              items: [
                { key: "all", label: "All regions" },
                ...availableRegions.map((region) => ({
                  key: region,
                  label: R2_REGION_LABELS[region] ?? region,
                })),
              ],
              onClick: ({ key }) =>
                setRegionFilterState(key === "all" ? undefined : key),
            }}
            trigger={["click"]}
          >
            <Button size="small">
              Region:{" "}
              {regionFilterState
                ? R2_REGION_LABELS[regionFilterState] ?? regionFilterState
                : "All"}
            </Button>
          </Dropdown>
        )}
        {lockRegion && regionFilterState && (
          <Tag color="geekblue">
            Region: {R2_REGION_LABELS[regionFilterState] ?? regionFilterState}
          </Tag>
        )}
      </Space>
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
                <List.Item style={{ background: "#f7f7f7" }}>
                  <Typography.Text strong>{item.label}</Typography.Text>
                </List.Item>
              );
            }
            const host = item.host as Host;
            const disabled =
              host.id === currentHostId || host.can_place === false;
            const muted = !host.can_place;
            return (
              <List.Item style={muted ? { opacity: 0.6 } : undefined}>
                <Space
                  direction="vertical"
                  style={{ width: "100%" }}
                  size="small"
                >
                  <Space
                    align="center"
                    style={{ width: "100%", justifyContent: "space-between" }}
                  >
                    <Space wrap>
                      <Radio value={host.id} disabled={disabled}>
                        {host.name}
                      </Radio>
                      <Tooltip
                        title={getHostStatusTooltip(
                          host.status,
                          Boolean(host.deleted),
                          host.provider_observed_at,
                        )}
                      >
                        <Tag color={STATUS_COLOR[host.status] ?? "default"}>
                          {host.status}
                        </Tag>
                      </Tooltip>
                      {host.tier != null && (
                        <Tag color={host.can_place ? "blue" : "default"}>
                          Tier {host.tier}
                        </Tag>
                      )}
                      {host.can_place !== false ? (
                        <Tag color="green">Available</Tag>
                      ) : (
                        <Tag icon={<Icon name="lock" />} color="default">
                          Locked
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
