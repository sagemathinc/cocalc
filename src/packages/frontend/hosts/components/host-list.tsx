import { Button, Card, Col, Popconfirm, Radio, Row, Space, Switch, Table, Tag, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { HostCard } from "./host-card";
import { STATUS_COLOR } from "../constants";
import {
  getProviderDescriptor,
  isKnownProvider,
} from "../providers/registry";
import type { HostListViewMode } from "../types";

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
  } = vm;

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (_: string, host: Host) => (
        <Button type="link" onClick={() => onDetails(host)}>
          {host.name}
        </Button>
      ),
    },
    {
      title: "Provider",
      key: "provider",
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
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
    },
    {
      title: "GPU",
      key: "gpu",
      render: (_: string, host: Host) => (host.gpu ? "Yes" : "No"),
    },
    {
      title: "Status",
      key: "status",
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

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Space size="large" align="center">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Project Hosts
        </Typography.Title>
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
          dataSource={hosts}
          pagination={false}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {hosts.map((host) => (
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
