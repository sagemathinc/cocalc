import { Button, Card, Col, Popconfirm, Popover, Radio, Row, Select, Space, Switch, Table, Tag, Typography } from "antd";
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

  const [statusOrder, setStatusOrder] = React.useState<string[]>([]);
  const sortKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    if (sortField !== "status") {
      setStatusOrder((prev) => (prev.length ? [] : prev));
      sortKeyRef.current = `${sortField}:${sortDirection}`;
      return;
    }
    const sortKey = `${sortField}:${sortDirection}`;
    const sortChanged = sortKeyRef.current !== sortKey;
    sortKeyRef.current = sortKey;
    setStatusOrder((prev) => {
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
  }, [hosts, sortField, sortDirection, autoResort]);

  const sortedHosts = React.useMemo(() => {
    if (sortField === "status" && !autoResort && statusOrder.length) {
      const hostMap = new Map(hosts.map((host) => [host.id, host]));
      const ordered = statusOrder
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
  }, [hosts, sortField, sortDirection, autoResort, statusOrder]);

  const resortNow = React.useCallback(() => {
    if (sortField !== "status") return;
    setStatusOrder((prev) => {
      const next = sortHosts(hosts, sortField, sortDirection).map(
        (host) => host.id,
      );
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [hosts, sortField, sortDirection]);

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
        const startDisabled =
          isDeleted || host.status === "running" || host.status === "starting";
        const startLabel = host.status === "starting" ? "Starting" : "Start";
        const stopLabel = host.status === "stopping" ? "Stopping" : "Stop";
        const allowStop =
          !isDeleted && (host.status === "running" || host.status === "error");
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

        return (
          <Space size="small">
            <Button
              size="small"
              type="link"
              disabled={startDisabled}
              onClick={() => onStart(host.id)}
            >
              {startLabel}
            </Button>
            {allowStop ? (
              <Popconfirm
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
              <Button size="small" type="link" disabled>
                {stopLabel}
              </Button>
            )}
            <Button
              size="small"
              type="link"
              disabled={isDeleted}
              onClick={() => onEdit(host)}
            >
              Edit
            </Button>
            <Popconfirm
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
            </Popconfirm>
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
  ] satisfies { value: HostSortField; label: string }[];

  const toggleDirection = () => {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  };

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
          {sortField === "status" && (
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
      {viewMode === "list" ? (
        <Table
          rowKey={(host) => host.id}
          columns={columns}
          dataSource={sortedHosts}
          pagination={false}
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
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};
