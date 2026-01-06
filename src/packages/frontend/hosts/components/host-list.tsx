import { Button, Card, Col, Modal, Popconfirm, Popover, Radio, Row, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { HostCard } from "./host-card";
import { STATUS_COLOR } from "../constants";
import type { ColumnsType } from "antd/es/table";
import {
  getProviderDescriptor,
  isKnownProvider,
} from "../providers/registry";
import type {
  HostListViewMode,
  HostSortDirection,
  HostSortField,
} from "../types";

const STATUS_ORDER = [
  "running",
  "active",
  "starting",
  "off",
  "stopping",
  "error",
  "deprovisioned",
  "deleted",
] as const;

const STATUS_RANK = new Map(
  STATUS_ORDER.map((status, index) => [status, index]),
);

function getProviderLabel(host: Host): string {
  const cloud = host.machine?.cloud;
  if (!cloud) return "n/a";
  if (isKnownProvider(cloud)) {
    return getProviderDescriptor(cloud).label;
  }
  return cloud;
}

function compareText(a?: string, b?: string): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function compareNumber(a?: number, b?: number): number {
  return (a ?? 0) - (b ?? 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sortHosts(
  hosts: Host[],
  field: HostSortField,
  direction: HostSortDirection,
): Host[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...hosts].sort((a, b) => {
    let result = 0;
    switch (field) {
      case "name":
        result = compareText(a.name, b.name);
        break;
      case "provider":
        result = compareText(getProviderLabel(a), getProviderLabel(b));
        break;
      case "region":
        result = compareText(a.region, b.region);
        break;
      case "size":
        result = compareText(a.size, b.size);
        break;
      case "status": {
        const aStatus = a.deleted ? "deleted" : a.status;
        const bStatus = b.deleted ? "deleted" : b.status;
        const aRank = STATUS_RANK.get(aStatus) ?? STATUS_ORDER.length;
        const bRank = STATUS_RANK.get(bStatus) ?? STATUS_ORDER.length;
        result = compareNumber(aRank, bRank);
        break;
      }
      case "changed": {
        const aRaw = a.last_action_at ?? a.last_seen ?? "";
        const bRaw = b.last_action_at ?? b.last_seen ?? "";
        const aTs = aRaw ? Date.parse(aRaw) : 0;
        const bTs = bRaw ? Date.parse(bRaw) : 0;
        result = compareNumber(
          Number.isNaN(aTs) ? 0 : aTs,
          Number.isNaN(bTs) ? 0 : bTs,
        );
        break;
      }
      default:
        result = 0;
    }
    if (result !== 0) return dir * result;
    const nameResult = compareText(a.name, b.name);
    if (nameResult !== 0) return nameResult;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

type HostListViewModel = {
  hosts: Host[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
  onEdit: (host: Host) => void;
  selfHost?: {
    connectorMap: Map<string, { id: string; name?: string; last_seen?: string }>;
    isConnectorOnline: (connectorId?: string) => boolean;
    onSetup: (host: Host) => void;
  };
  viewMode: HostListViewMode;
  setViewMode: (mode: HostListViewMode) => void;
  isAdmin: boolean;
  showAdmin: boolean;
  setShowAdmin: (value: boolean) => void;
  showDeleted: boolean;
  setShowDeleted: (value: boolean) => void;
  sortField: HostSortField;
  setSortField: (value: HostSortField) => void;
  sortDirection: HostSortDirection;
  setSortDirection: (value: HostSortDirection) => void;
  autoResort: boolean;
  setAutoResort: (value: boolean) => void;
};

export const HostList: React.FC<{ vm: HostListViewModel }> = ({ vm }) => {
  const {
    hosts,
    onStart,
    onStop,
    onDelete,
    onDetails,
    onEdit,
    selfHost,
    viewMode,
    setViewMode,
    isAdmin,
    showAdmin,
    setShowAdmin,
    showDeleted,
    setShowDeleted,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    autoResort,
    setAutoResort,
  } = vm;

  const [selectedRowKeys, setSelectedRowKeys] = React.useState<string[]>([]);

  const [dynamicOrder, setDynamicOrder] = React.useState<string[]>([]);
  const sortKeyRef = React.useRef<string>("");
  const isDynamicSort = sortField === "status" || sortField === "changed";

  React.useEffect(() => {
    if (viewMode !== "list" && selectedRowKeys.length) {
      setSelectedRowKeys([]);
    }
  }, [viewMode, selectedRowKeys.length]);

  React.useEffect(() => {
    if (!selectedRowKeys.length) return;
    const hostIds = new Set(hosts.map((host) => host.id));
    setSelectedRowKeys((prev) => prev.filter((id) => hostIds.has(id)));
  }, [hosts, selectedRowKeys.length]);

  React.useEffect(() => {
    if (!isDynamicSort) {
      setDynamicOrder((prev) => (prev.length ? [] : prev));
      sortKeyRef.current = `${sortField}:${sortDirection}`;
      return;
    }
    const sortKey = `${sortField}:${sortDirection}`;
    const sortChanged = sortKeyRef.current !== sortKey;
    sortKeyRef.current = sortKey;
    setDynamicOrder((prev) => {
      if (autoResort || prev.length === 0 || sortChanged) {
        const next = sortHosts(hosts, sortField, sortDirection).map(
          (host) => host.id,
        );
        return arraysEqual(prev, next) ? prev : next;
      }
      const hostIds = new Set(hosts.map((host) => host.id));
      const current = prev.filter((id) => hostIds.has(id));
      const currentSet = new Set(current);
      const missing = hosts.filter((host) => !currentSet.has(host.id));
      if (!missing.length && current.length === prev.length) {
        return prev;
      }
      const sortedMissing = sortHosts(missing, sortField, sortDirection).map(
        (host) => host.id,
      );
      const next = [...current, ...sortedMissing];
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [hosts, sortField, sortDirection, autoResort, isDynamicSort]);

  const sortedHosts = React.useMemo(() => {
    if (isDynamicSort && !autoResort && dynamicOrder.length) {
      const hostMap = new Map(hosts.map((host) => [host.id, host]));
      const ordered = dynamicOrder
        .map((id) => hostMap.get(id))
        .filter((host): host is Host => !!host);
      const orderedIds = new Set(ordered.map((host) => host.id));
      if (ordered.length === hosts.length) {
        return ordered;
      }
      const missing = hosts.filter((host) => !orderedIds.has(host.id));
      if (!missing.length) return ordered;
      return ordered.concat(sortHosts(missing, sortField, sortDirection));
    }
    return sortHosts(hosts, sortField, sortDirection);
  }, [hosts, sortField, sortDirection, autoResort, dynamicOrder, isDynamicSort]);

  const resortNow = React.useCallback(() => {
    if (!isDynamicSort) return;
    setDynamicOrder((prev) => {
      const next = sortHosts(hosts, sortField, sortDirection).map(
        (host) => host.id,
      );
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [hosts, sortField, sortDirection, isDynamicSort]);

  const selectedHosts = React.useMemo(() => {
    if (!selectedRowKeys.length) return [] as Host[];
    const hostMap = new Map(hosts.map((host) => [host.id, host]));
    return selectedRowKeys
      .map((id) => hostMap.get(id))
      .filter((host): host is Host => !!host);
  }, [hosts, selectedRowKeys]);

  const startTargets = React.useMemo(
    () =>
      selectedHosts.filter(
        (host) =>
          !host.deleted &&
          host.status !== "running" &&
          host.status !== "starting" &&
          (!selfHost?.isConnectorOnline ||
            host.machine?.cloud !== "self-host" ||
            selfHost.isConnectorOnline(host.region)),
      ),
    [selectedHosts, selfHost],
  );
  const stopTargets = React.useMemo(
    () =>
      selectedHosts.filter(
        (host) =>
          !host.deleted &&
          (host.status === "running" ||
            (host.status as Host["status"] | "active") === "active" ||
            host.status === "error"),
      ),
    [selectedHosts],
  );
  const deprovisionTargets = React.useMemo(
    () =>
      selectedHosts.filter(
        (host) => !host.deleted && host.status !== "deprovisioned",
      ),
    [selectedHosts],
  );
  const deleteTargets = React.useMemo(
    () =>
      selectedHosts.filter(
        (host) => !host.deleted && host.status === "deprovisioned",
      ),
    [selectedHosts],
  );

  const runBulkAction = React.useCallback(
    async (
      actionLabel: string,
      targets: Host[],
      handler: (id: string) => Promise<void> | void,
      opts?: { danger?: boolean },
    ) => {
      if (!targets.length) return;
      Modal.confirm({
        title: `${actionLabel} ${targets.length} host${
          targets.length === 1 ? "" : "s"
        }?`,
        content: (
          <div>
            <Typography.Text type="secondary">
              This will apply to:
            </Typography.Text>
            <ul style={{ maxHeight: 240, overflowY: "auto", marginTop: 8 }}>
              {targets.map((host) => (
                <li key={host.id}>
                  {host.name} ({getProviderLabel(host)})
                </li>
              ))}
            </ul>
          </div>
        ),
        okText: actionLabel,
        okButtonProps: opts?.danger ? { danger: true } : undefined,
        onOk: async () => {
          for (const host of targets) {
            await handler(host.id);
          }
          setSelectedRowKeys([]);
        },
      });
    },
    [],
  );

  const columns: ColumnsType<Host> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder:
        sortField === "name"
          ? sortDirection === "asc"
            ? "ascend"
            : "descend"
          : undefined,
      render: (_: string, host: Host) => (
        <Space direction="vertical" size={0}>
          <Button type="link" onClick={() => onDetails(host)}>
            {host.name}
          </Button>
          {host.status === "error" && host.last_error && (
            <Popover
              title="Error"
              content={
                <div style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>
                  {host.last_error}
                </div>
              }
            >
              <Button
                size="small"
                type="link"
                danger
                style={{ padding: 0, height: "auto" }}
              >
                Error
              </Button>
            </Popover>
          )}
        </Space>
      ),
    },
    {
      title: "Provider",
      key: "provider",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder:
        sortField === "provider"
          ? sortDirection === "asc"
            ? "ascend"
            : "descend"
          : undefined,
      render: (_: string, host: Host) =>
        host.machine?.cloud
          ? isKnownProvider(host.machine.cloud)
            ? getProviderDescriptor(host.machine.cloud).label
            : host.machine.cloud
          : "n/a",
    },
    {
      title: "Region",
      dataIndex: "region",
      key: "region",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder:
        sortField === "region"
          ? sortDirection === "asc"
            ? "ascend"
            : "descend"
          : undefined,
      render: (_: string, host: Host) =>
        host.machine?.cloud === "self-host" ? `Connector: ${host.region}` : host.region,
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder:
        sortField === "size"
          ? sortDirection === "asc"
            ? "ascend"
            : "descend"
          : undefined,
    },
    {
      title: "GPU",
      key: "gpu",
      render: (_: string, host: Host) => (host.gpu ? "Yes" : "No"),
    },
    {
      title: "Status",
      key: "status",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder:
        sortField === "status"
          ? sortDirection === "asc"
            ? "ascend"
            : "descend"
          : undefined,
      render: (_: string, host: Host) => (
        <Tag color={host.deleted ? "default" : STATUS_COLOR[host.status]}>
          {host.deleted ? "deleted" : host.status}
        </Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: string, host: Host) => {
        const isDeleted = !!host.deleted;
        const isSelfHost = host.machine?.cloud === "self-host";
        const connectorOnline =
          !isSelfHost ||
          !selfHost?.isConnectorOnline ||
          selfHost.isConnectorOnline(host.region);
        const showConnectorSetup =
          isSelfHost && !connectorOnline && host.status === "off";
        const startDisabled =
          isDeleted ||
          host.status === "running" ||
          host.status === "starting" ||
          !connectorOnline;
        const startLabel = host.status === "starting" ? "Starting" : "Start";
        const stopLabel = host.status === "stopping" ? "Stopping" : "Stop";
        const statusValue = host.status as Host["status"] | "active";
        const allowStop =
          !isDeleted &&
          (statusValue === "running" ||
            statusValue === "active" ||
            statusValue === "error");
        const deleteLabel = isDeleted
          ? "Deleted"
          : host.status === "deprovisioned"
            ? "Delete"
            : "Deprovision";
        const deleteTitle =
          host.status === "deprovisioned"
            ? "Delete this host?"
            : "Deprovision this host?";
        const deleteOkText =
          host.status === "deprovisioned" ? "Delete" : "Deprovision";

        const actions = [
          <Button
            key="start"
            size="small"
            type="link"
            disabled={startDisabled}
            onClick={() => onStart(host.id)}
          >
            {startLabel}
          </Button>,
          showConnectorSetup && selfHost ? (
            <Button
              key="setup"
              size="small"
              type="link"
              onClick={() => selfHost.onSetup(host)}
            >
              Setup
            </Button>
          ) : null,
          allowStop ? (
            <Popconfirm
              key="stop"
              title="Stop this host?"
              okText="Stop"
              cancelText="Cancel"
              onConfirm={() => onStop(host.id)}
            >
              <Button size="small" type="link">
                {stopLabel}
              </Button>
            </Popconfirm>
          ) : (
            <Button key="stop" size="small" type="link" disabled>
              {stopLabel}
            </Button>
          ),
          <Button
            key="edit"
            size="small"
            type="link"
            disabled={isDeleted}
            onClick={() => onEdit(host)}
          >
            Edit
          </Button>,
          <Popconfirm
            key="delete"
            title={deleteTitle}
            okText={deleteOkText}
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(host.id)}
            disabled={isDeleted}
          >
            <Button size="small" type="link" danger disabled={isDeleted}>
              {deleteLabel}
            </Button>
          </Popconfirm>,
        ];

        return (
          <Space size="small">
            {actions.filter(Boolean) as React.ReactNode[]}
          </Space>
        );
      },
    },
  ];

  const sortOptions = [
    { value: "name", label: "Name" },
    { value: "provider", label: "Provider" },
    { value: "region", label: "Region" },
    { value: "size", label: "Size" },
    { value: "status", label: "Status" },
    { value: "changed", label: "Changed" },
  ] satisfies { value: HostSortField; label: string }[];

  const toggleDirection = () => {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  };

  const bulkActions =
    viewMode === "list" && selectedRowKeys.length ? (
      <div style={{ marginBottom: 12 }}>
        <Space wrap size="small">
          <Typography.Text>
            Selected: {selectedRowKeys.length}
          </Typography.Text>
          <Button
            size="small"
            onClick={() =>
              runBulkAction("Start", startTargets, onStart)
            }
            disabled={!startTargets.length}
          >
            Start ({startTargets.length})
          </Button>
          <Button
            size="small"
            onClick={() =>
              runBulkAction("Stop", stopTargets, onStop)
            }
            disabled={!stopTargets.length}
          >
            Stop ({stopTargets.length})
          </Button>
          <Button
            size="small"
            danger
            onClick={() =>
              runBulkAction("Deprovision", deprovisionTargets, onDelete, {
                danger: true,
              })
            }
            disabled={!deprovisionTargets.length}
          >
            Deprovision ({deprovisionTargets.length})
          </Button>
          <Button
            size="small"
            danger
            onClick={() =>
              runBulkAction("Delete", deleteTargets, onDelete, {
                danger: true,
              })
            }
            disabled={!deleteTargets.length}
          >
            Delete ({deleteTargets.length})
          </Button>
        </Space>
      </div>
    ) : null;

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Space size="large" align="center">
        <Space size="middle" align="center">
          <Typography.Title level={5} style={{ margin: 0 }}>
            Project Hosts
          </Typography.Title>
          <Space size="small" align="center">
            <Typography.Text>Sort by</Typography.Text>
            <Select
              size="small"
              value={sortField}
              options={sortOptions}
              onChange={(value) => setSortField(value as HostSortField)}
              style={{ minWidth: 140 }}
            />
            <Button size="small" onClick={toggleDirection}>
              {sortDirection === "asc" ? "Asc" : "Desc"}
            </Button>
          </Space>
          {isDynamicSort && (
            <Space size="small" align="center">
              <Switch size="small" checked={autoResort} onChange={setAutoResort} />
              {autoResort ? (
                <Typography.Text>Auto-resort</Typography.Text>
              ) : (
                <Button size="small" type="link" onClick={resortNow}>
                  Auto-resort
                </Button>
              )}
            </Space>
          )}
        </Space>
        <Space size="middle" align="center">
          {isAdmin && (
            <Space size="small" align="center">
              <Switch size="small" checked={showAdmin} onChange={setShowAdmin} />
              <Typography.Text>All (Admin)</Typography.Text>
            </Space>
          )}
          <Space size="small" align="center">
            <Switch size="small" checked={showDeleted} onChange={setShowDeleted} />
            <Typography.Text>Deleted</Typography.Text>
          </Space>
        </Space>
      </Space>
      <Radio.Group
        value={viewMode}
        onChange={(event) =>
          setViewMode(event.target.value as HostListViewMode)
        }
        optionType="button"
        buttonStyle="solid"
      >
        <Radio.Button value="grid">Cards</Radio.Button>
        <Radio.Button value="list">List</Radio.Button>
      </Radio.Group>
    </div>
  );

  if (hosts.length === 0) {
    return (
      <div>
        {header}
        <Card
          style={{ maxWidth: 720, margin: "0 auto" }}
          title={
            <span>
              <Icon name="server" /> Project Hosts
            </span>
          }
        >
          <Typography.Paragraph>
            Dedicated project hosts let you run and share normal CoCalc projects
            on your own VMs (e.g. GPU or large-memory machines). Create one below
            to get started.
          </Typography.Paragraph>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {header}
      {bulkActions}
      {viewMode === "list" ? (
        <Table
          rowKey={(host) => host.id}
          columns={columns}
          dataSource={sortedHosts}
          pagination={false}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
            getCheckboxProps: (record) => ({
              disabled: !!record.deleted,
            }),
          }}
          onChange={(_pagination, _filters, sorter) => {
            const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter;
            const nextKey =
              (nextSorter?.columnKey as HostSortField | undefined) ??
              (nextSorter?.field as HostSortField | undefined);
            const nextOrder = nextSorter?.order;
            if (!nextKey || !nextOrder) {
              setSortField("name");
              setSortDirection("asc");
              return;
            }
            setSortField(nextKey);
            setSortDirection(nextOrder === "ascend" ? "asc" : "desc");
          }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {sortedHosts.map((host) => (
            <Col xs={24} md={12} lg={8} key={host.id}>
              <HostCard
                host={host}
                onStart={onStart}
                onStop={onStop}
                onDelete={onDelete}
                onDetails={onDetails}
                onEdit={onEdit}
                selfHost={selfHost}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};
