import { Button, Card, Col, Radio, Row, Space, Table, Tag, Typography } from "antd";
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
  } = vm;
  if (hosts.length === 0) {
    return (
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
    );
  }

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
        <Tag color={STATUS_COLOR[host.status]}>{host.status}</Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: string, host: Host) => (
        <Space size="small">
          <Button
            size="small"
            type="link"
            disabled={host.status === "running"}
            onClick={() => onStart(host.id)}
          >
            Start
          </Button>
          <Button
            size="small"
            type="link"
            disabled={host.status !== "running"}
            onClick={() => onStop(host.id)}
          >
            Stop
          </Button>
          <Button size="small" type="link" onClick={() => onEdit(host)}>
            Edit
          </Button>
          <Button
            size="small"
            type="link"
            danger
            onClick={() => onDelete(host.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Project Hosts
        </Typography.Title>
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
