import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Slider,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CSS,
  React,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Bootlog from "@cocalc/frontend/project/bootlog";
import type { Host } from "@cocalc/conat/hub/api/hosts";

const WRAP_STYLE: CSS = {
  padding: "24px",
  width: "100%",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box",
};

const STATUS_COLOR = {
  stopped: "red",
  running: "green",
  provisioning: "blue",
  starting: "blue",
  stopping: "orange",
  deprovisioned: "default",
  off: "red",
} as const;

const REGIONS = [
  { value: "us-west", label: "US West" },
  { value: "us-east", label: "US East" },
  { value: "eu-west", label: "EU West" },
];

const SIZES = [
  { value: "small", label: "Small (2 vCPU / 8 GB)" },
  { value: "medium", label: "Medium (4 vCPU / 16 GB)" },
  { value: "large", label: "Large (8 vCPU / 32 GB)" },
  { value: "gpu", label: "GPU (4 vCPU / 24 GB + GPU)" },
];

const GPU_TYPES = [
  { value: "none", label: "No GPU" },
  { value: "l4", label: "NVIDIA L4" },
  { value: "a10g", label: "NVIDIA A10G" },
];

export const HostsPage: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Host | undefined>(undefined);
  const [creating, setCreating] = useState<boolean>(false);
  const hub = webapp_client.conat_client.hub;

  const refresh = async () => {
    const list = await hub.hosts.listHosts({});
    setHosts(list);
    if (selected) {
      const updated = list.find((h) => h.id === selected.id);
      setSelected(updated);
    }
  };

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load hosts", err);
      message.error("Unable to load hosts");
    });
  }, []);

  const onCreate = async (vals: any) => {
    if (creating) return;
    setCreating(true);
    try {
      await hub.hosts.createHost({
        name: vals.name ?? "My Host",
        region: vals.region ?? REGIONS[0].value,
        size: vals.size ?? SIZES[0].value,
        gpu: vals.gpu && vals.gpu !== "none",
        machine: {
          gpu_type: vals.gpu,
          disk_gb: vals.disk,
          metadata: {
            shared: vals.shared,
            bucket: vals.bucket,
          },
        },
      });
      await refresh();
      message.success("Host created");
    } catch (err) {
      console.error(err);
      message.error("Failed to create host");
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, action: "start" | "stop") => {
    try {
      setHosts((prev) =>
        prev.map((h) =>
          h.id === id
            ? { ...h, status: action === "start" ? "starting" : "stopping" }
            : h,
        ),
      );
      if (action === "start") {
        await hub.hosts.startHost({ id });
      } else {
        await hub.hosts.stopHost({ id });
      }
      await refresh();
    } catch (err) {
      console.error(err);
      message.error(`Failed to ${action} host`);
    }
  };

  const removeHost = async (id: string) => {
    try {
      await hub.hosts.deleteHost({ id });
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to delete host");
    }
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
                  onClick={() => setStatus(host.id, "start")}
                >
                  Start
                </Button>,
                <Button
                  key="stop"
                  type="link"
                  disabled={host.status !== "running"}
                  onClick={() => setStatus(host.id, "stop")}
                >
                  Stop
                </Button>,
                <Button
                  key="details"
                  type="link"
                  onClick={() => {
                    setSelected(host);
                    setDrawerOpen(true);
                  }}
                >
                  Details
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
              <Collapse ghost style={{ marginBottom: 8 }}>
                <Collapse.Panel header="Advanced options" key="adv">
                  <Row gutter={[12, 12]}>
                    <Col span={24}>
                      <Form.Item
                        name="gpu"
                        label="GPU"
                        initialValue="none"
                        tooltip="Only needed for GPU workloads."
                      >
                        <Select options={GPU_TYPES} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="disk"
                        label="Disk size (GB)"
                        initialValue={100}
                        tooltip="Root disk for projects on this host."
                      >
                        <Slider min={50} max={1000} step={50} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="shared"
                        label="Shared volume"
                        tooltip="Optional Btrfs subvolume bind-mounted into projects on this host."
                        initialValue="none"
                      >
                        <Select
                          options={[
                            { value: "none", label: "None" },
                            { value: "rw", label: "Shared volume (rw)" },
                            { value: "ro", label: "Shared volume (ro)" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="bucket"
                        label="Mount bucket (gcsfuse)"
                        tooltip="Optional bucket to mount via gcsfuse on this host."
                      >
                        <Input placeholder="bucket-name (optional)" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Collapse.Panel>
              </Collapse>
              <Divider style={{ margin: "8px 0" }} />
              <Space
                direction="vertical"
                style={{ width: "100%" }}
                size="small"
              >
                <Typography.Text type="secondary">
                  Cost estimate (placeholder): updates with size/region
                </Typography.Text>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={creating}
                  block
                >
                  Create host
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          {content}
        </Col>
      </Row>
      <Drawer
        title={
          <Space>
            <Icon name="server" /> {selected?.name ?? "Host details"}
            {selected && (
              <Tag color={STATUS_COLOR[selected.status]}>{selected.status}</Tag>
            )}
          </Space>
        }
        width={640}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen && !!selected}
      >
        {selected ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Space size="small">
              <Tag>{selected.region}</Tag>
              <Tag>{selected.size}</Tag>
              {selected.gpu && <Tag color="purple">GPU</Tag>}
            </Space>
            <Typography.Text>Projects: {selected.projects ?? 0}</Typography.Text>
            <Typography.Text type="secondary">
              Last seen: {selected.last_seen ?? "n/a"}
            </Typography.Text>
            <Divider />
            <Typography.Title level={5}>Activity</Typography.Title>
            <Bootlog host_id={selected.id} style={{ maxWidth: "100%" }} />
          </Space>
        ) : (
          <Typography.Text type="secondary">
            Select a host to see details.
          </Typography.Text>
        )}
      </Drawer>
    </div>
  );
};
