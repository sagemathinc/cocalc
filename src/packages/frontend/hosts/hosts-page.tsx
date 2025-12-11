import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { CSS, React, useMemo, useState } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";

type Status = "stopped" | "running" | "provisioning";
type Host = {
  id: string;
  name: string;
  region: string;
  size: string;
  gpu: boolean;
  status: Status;
  last_seen?: string;
  projects?: number;
};

const WRAP_STYLE: CSS = {
  padding: "24px",
  width: "100%",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box",
};

const STATUS_COLOR: Record<Status, string> = {
  stopped: "red",
  running: "green",
  provisioning: "blue",
};

const REGIONS = [
  { value: "us-west", label: "US West" },
  { value: "us-east", label: "US East" },
  { value: "eu-west", label: "EU West" },
];

const SIZES = [
  { value: "small", label: "Small (2 vCPU / 8 GB)" },
  { value: "medium", label: "Medium (4 vCPU / 16 GB)" },
  { value: "large", label: "Large (8 vCPU / 32 GB)" },
];

export const HostsPage: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [creating, setCreating] = useState<boolean>(false);

  const onCreate = async (vals: any) => {
    setCreating(true);
    try {
      const newHost: Host = {
        id: crypto.randomUUID(),
        name: vals.name ?? "My Host",
        region: vals.region ?? REGIONS[0].value,
        size: vals.size ?? SIZES[0].value,
        gpu: !!vals.gpu,
        status: "stopped",
        projects: 0,
      };
      setHosts((prev) => [newHost, ...prev]);
      message.success("Host created (placeholder)");
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = (id: string, next: Status) => {
    setHosts((prev) =>
      prev.map((h) => (h.id === id ? { ...h, status: next } : h)),
    );
  };

  const removeHost = (id: string) => {
    setHosts((prev) => prev.filter((h) => h.id !== id));
  };

  const content = useMemo(() => {
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
            Dedicated project hosts let you run and share normal CoCalc
            projects on your own VMs (e.g. GPU or large-memory machines).
            Create one below to get started.
          </Typography.Paragraph>
        </Card>
      );
    }

    return (
      <Row gutter={[16, 16]}>
        {hosts.map((host) => (
          <Col xs={24} md={12} lg={8} key={host.id}>
            <Card
              title={host.name}
              extra={
                <Tag color={STATUS_COLOR[host.status]}>{host.status}</Tag>
              }
              actions={[
                <Button
                  key="start"
                  type="link"
                  disabled={host.status === "running"}
                  onClick={() => toggleStatus(host.id, "running")}
                >
                  Start
                </Button>,
                <Button
                  key="stop"
                  type="link"
                  disabled={host.status !== "running"}
                  onClick={() => toggleStatus(host.id, "stopped")}
                >
                  Stop
                </Button>,
                <Button
                  key="delete"
                  type="link"
                  danger
                  onClick={() => removeHost(host.id)}
                >
                  Delete
                </Button>,
              ]}
            >
              <Space direction="vertical" size="small">
                <Typography.Text>Region: {host.region}</Typography.Text>
                <Typography.Text>Size: {host.size}</Typography.Text>
                <Typography.Text>GPU: {host.gpu ? "Yes" : "No"}</Typography.Text>
                <Typography.Text>
                  Projects: {host.projects ?? 0}
                </Typography.Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }, [hosts]);

  return (
    <div className="smc-vfill" style={WRAP_STYLE}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <Icon name="plus" /> Create host
              </span>
            }
          >
            <Form layout="vertical" onFinish={onCreate}>
              <Form.Item name="name" label="Name" initialValue="My host">
                <Input placeholder="My host" />
              </Form.Item>
              <Form.Item
                name="region"
                label="Region"
                initialValue={REGIONS[0].value}
              >
                <Select options={REGIONS} />
              </Form.Item>
              <Form.Item name="size" label="Size" initialValue={SIZES[0].value}>
                <Select options={SIZES} />
              </Form.Item>
              <Form.Item name="gpu" label="GPU">
                <Select
                  options={[
                    { value: false, label: "No GPU" },
                    { value: true, label: "GPU enabled" },
                  ]}
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={creating}
                  block
                >
                  Create host
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          {content}
        </Col>
      </Row>
    </div>
  );
};
