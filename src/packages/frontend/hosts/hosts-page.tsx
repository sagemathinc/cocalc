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
  Alert,
  message,
} from "antd";
import {
  CSS,
  React,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Bootlog from "@cocalc/frontend/project/bootlog";
import type { Host, HostCatalog } from "@cocalc/conat/hub/api/hosts";
import { getMachineTypeArchitecture } from "@cocalc/util/db-schema/compute-servers";

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

const PROVIDERS = [
  { value: "none", label: "Local (manual setup)" },
  { value: "gcp", label: "Google Cloud" },
];

const DISK_TYPES = [
  { value: "balanced", label: "Balanced SSD" },
  { value: "ssd", label: "SSD" },
  { value: "standard", label: "Standard (HDD)" },
];

function imageVersionCode(name: string): number | undefined {
  const match = name.match(/ubuntu-.*?(\d{2})(\d{2})/i);
  if (!match) return undefined;
  return Number(`${match[1]}${match[2]}`);
}

export const HostsPage: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Host | undefined>(undefined);
  const [creating, setCreating] = useState<boolean>(false);
  const [canCreateHosts, setCanCreateHosts] = useState<boolean>(true);
  const [catalog, setCatalog] = useState<HostCatalog | undefined>(undefined);
  const [catalogError, setCatalogError] = useState<string | undefined>(
    undefined,
  );
  const [catalogRefreshing, setCatalogRefreshing] = useState<boolean>(false);
  const hub = webapp_client.conat_client.hub;
  const [form] = Form.useForm();
  const isAdmin = useTypedRedux("account", "is_admin");

  const refresh = async () => {
    const [list, membership] = await Promise.all([
      hub.hosts.listHosts({}),
      hub.purchases.getMembership({}),
    ]);
    setHosts(list);
    setCanCreateHosts(membership?.entitlements?.features?.create_hosts === true);
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

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const data = await hub.hosts.getCatalog({ provider: "gcp" });
        setCatalog(data);
        setCatalogError(undefined);
      } catch (err: any) {
        console.error("failed to load cloud catalog", err);
        setCatalog(undefined);
        setCatalogError(
          err?.message ?? "Unable to load cloud catalog (regions/zones).",
        );
      }
    };
    loadCatalog().catch((err) => console.error("catalog refresh failed", err));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch((err) => console.error("host refresh failed", err));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const selectedProvider = Form.useWatch("provider", form);
  const selectedRegion = Form.useWatch("region", form);
  const selectedZone = Form.useWatch("zone", form);
  const selectedMachineType = Form.useWatch("machine_type", form);
  const selectedGpuType = Form.useWatch("gpu_type", form);
  const selectedSourceImage = Form.useWatch("source_image", form);

  const regionOptions =
    selectedProvider === "gcp" && catalog?.regions?.length
      ? catalog.regions.map((r) => {
          const zoneWithMeta = catalog.zones?.find(
            (z) => z.region === r.name && (z.location || z.lowC02),
          );
          const location = zoneWithMeta?.location;
          const lowC02 = zoneWithMeta?.lowC02 ? " (low CO₂)" : "";
          const suffix = location ? ` — ${location}${lowC02}` : "";
          return { value: r.name, label: `${r.name}${suffix}` };
        })
      : REGIONS;

  const zoneOptions =
    selectedProvider === "gcp" && catalog?.regions?.length
      ? (catalog.regions.find((r) => r.name === selectedRegion)?.zones ?? []).map(
          (z) => {
            const meta = catalog.zones?.find((zone) => zone.name === z);
            const suffix = meta?.location ? ` — ${meta.location}` : "";
            const lowC02 = meta?.lowC02 ? " (low CO₂)" : "";
            return { value: z, label: `${z}${suffix}${lowC02}` };
          },
        )
      : [];

  const machineTypeOptions =
    selectedProvider === "gcp" && selectedZone && catalog?.machine_types_by_zone
      ? (catalog.machine_types_by_zone[selectedZone] ?? []).map((mt) => ({
          value: mt.name ?? "",
          label: mt.name ?? "unknown",
        }))
      : [];

  const gpuTypeOptions =
    selectedProvider === "gcp" && selectedZone && catalog?.gpu_types_by_zone
      ? (catalog.gpu_types_by_zone[selectedZone] ?? []).map((gt) => ({
          value: gt.name ?? "",
          label: gt.name ?? "unknown",
        }))
      : [];

  const imageOptions =
    selectedProvider === "gcp" && catalog?.images?.length
      ? [...catalog.images]
          .filter((img) => {
            if (!selectedMachineType) return true;
            const arch = getMachineTypeArchitecture(selectedMachineType);
            const imgArch = (img.architecture ?? "").toUpperCase();
            if (!imgArch) return true;
            return arch === "arm64" ? imgArch === "ARM64" : imgArch === "X86_64";
          })
          .filter((img) => {
            const wantsGpu = selectedGpuType && selectedGpuType !== "none";
            if (!wantsGpu) return !img.gpuReady;
            return !!img.gpuReady;
          })
          .sort((a, b) => {
            const va = imageVersionCode(a.family ?? a.name ?? "");
            const vb = imageVersionCode(b.family ?? b.name ?? "");
            if (va != null && vb != null && va !== vb) {
              return vb - va;
            }
            const ta = Date.parse(a.creationTimestamp ?? "");
            const tb = Date.parse(b.creationTimestamp ?? "");
            if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
            if (!Number.isFinite(ta)) return 1;
            if (!Number.isFinite(tb)) return -1;
            return tb - ta;
          })
          .map((img) => {
            const label = img.family
              ? `${img.family}${img.gpuReady ? " (GPU-ready)" : ""}`
              : img.name ?? "unknown";
            return {
              value: img.selfLink ?? img.name ?? "",
              label,
            };
          })
      : [];

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (selectedSourceImage) return;
    if (!imageOptions.length) return;
    form.setFieldsValue({ source_image: imageOptions[0].value });
  }, [selectedProvider, selectedSourceImage, imageOptions, form]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!zoneOptions.length) return;
    if (selectedZone && zoneOptions.some((z) => z.value === selectedZone)) {
      return;
    }
    form.setFieldsValue({ zone: zoneOptions[0].value });
  }, [selectedProvider, selectedRegion, zoneOptions, selectedZone, form]);

  const onCreate = async (vals: any) => {
    if (creating) return;
    setCreating(true);
    try {
      const machine_type = vals.machine_type || undefined;
      const gpu_type =
        vals.gpu_type && vals.gpu_type !== "none" ? vals.gpu_type : undefined;
      await hub.hosts.createHost({
        name: vals.name ?? "My Host",
        region: vals.region ?? REGIONS[0].value,
        size: machine_type ?? vals.size ?? SIZES[0].value,
        gpu: !!gpu_type,
        machine: {
          cloud: vals.provider !== "none" ? vals.provider : undefined,
          machine_type,
          gpu_type,
          gpu_count: gpu_type ? 1 : undefined,
          zone: vals.zone ?? undefined,
          disk_gb: vals.disk,
          disk_type: vals.disk_type,
          source_image: vals.source_image || undefined,
          metadata: {
            shared: vals.shared,
            bucket: vals.bucket,
            boot_disk_gb: vals.boot_disk_gb,
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

  const refreshCatalog = async () => {
    if (catalogRefreshing) return;
    setCatalogRefreshing(true);
    try {
      await hub.hosts.updateCloudCatalog({ provider: "gcp" });
      const data = await hub.hosts.getCatalog({ provider: "gcp" });
      setCatalog(data);
      setCatalogError(undefined);
      message.success("Cloud catalog updated");
    } catch (err) {
      console.error(err);
      message.error("Failed to update cloud catalog");
    } finally {
      setCatalogRefreshing(false);
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
                {host.status === "error" && host.error && (
                  <Typography.Text type="danger">{host.error}</Typography.Text>
                )}
                <Collapse ghost>
                  <Collapse.Panel header="Details" key="details">
                    <Space direction="vertical" size="small">
                      {host.machine?.zone && (
                        <Typography.Text>
                          Zone: {host.machine.zone}
                        </Typography.Text>
                      )}
                      {host.machine?.machine_type && (
                        <Typography.Text>
                          Machine type: {host.machine.machine_type}
                        </Typography.Text>
                      )}
                      {host.machine?.gpu_type && (
                        <Typography.Text>
                          GPU type: {host.machine.gpu_type}
                        </Typography.Text>
                      )}
                      {(host.machine?.source_image ||
                        host.machine?.metadata?.source_image) && (
                        <Typography.Text>
                          Image:{" "}
                          {host.machine?.source_image ??
                            host.machine?.metadata?.source_image}
                        </Typography.Text>
                      )}
                    </Space>
                  </Collapse.Panel>
                </Collapse>
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
            extra={
              isAdmin ? (
                <Button
                  size="small"
                  onClick={refreshCatalog}
                  loading={catalogRefreshing}
                >
                  Refresh catalog
                </Button>
              ) : undefined
            }
          >
            {!canCreateHosts && (
              <Alert
                type="info"
                showIcon
                message="Your membership does not allow creating project hosts."
                style={{ marginBottom: 12 }}
              />
            )}
            <Form
              layout="vertical"
              onFinish={onCreate}
              disabled={!canCreateHosts}
              form={form}
            >
              <Form.Item name="name" label="Name" initialValue="My host">
                <Input placeholder="My host" />
              </Form.Item>
              <Form.Item
                name="region"
                label="Region"
                initialValue={REGIONS[0].value}
              >
                <Select options={regionOptions} />
              </Form.Item>
              {selectedProvider !== "gcp" && (
                <Form.Item name="size" label="Size" initialValue={SIZES[0].value}>
                  <Select options={SIZES} />
                </Form.Item>
              )}
              {catalogError && selectedProvider === "gcp" && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Cloud catalog unavailable"
                  description={catalogError}
                />
              )}
              <Collapse ghost style={{ marginBottom: 8 }}>
                <Collapse.Panel header="Advanced options" key="adv">
                  <Row gutter={[12, 12]}>
                    <Col span={24}>
                      <Form.Item
                        name="provider"
                        label="Provider"
                        initialValue={PROVIDERS[0].value}
                      >
                        <Select options={PROVIDERS} />
                      </Form.Item>
                    </Col>
                    {selectedProvider === "gcp" && (
                      <>
                        <Col span={24}>
                          <Form.Item
                            name="zone"
                            label="Zone"
                            initialValue={zoneOptions[0]?.value}
                            tooltip="Zones are derived from the selected region."
                          >
                            <Select options={zoneOptions} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="machine_type"
                            label="Machine type"
                            initialValue={machineTypeOptions[0]?.value}
                          >
                            <Select options={machineTypeOptions} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="source_image"
                            label="Base image"
                            tooltip="Optional override; leave blank for the default Ubuntu image."
                          >
                            <Select
                              options={[
                                { value: "", label: "Default (Ubuntu LTS)" },
                                ...imageOptions,
                              ]}
                              showSearch
                              optionFilterProp="label"
                              allowClear
                            />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item name="gpu_type" label="GPU" initialValue="none">
                            <Select
                              options={[
                                { value: "none", label: "No GPU" },
                                ...gpuTypeOptions,
                              ]}
                            />
                          </Form.Item>
                        </Col>
                      </>
                    )}
                    <Col span={24}>
                      <Form.Item
                        name="gpu"
                        label="GPU"
                        initialValue="none"
                        tooltip="Only needed for GPU workloads."
                      >
                        <Select
                          options={GPU_TYPES}
                          disabled={selectedProvider === "gcp"}
                        />
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
                        name="disk_type"
                        label="Disk type"
                        initialValue={DISK_TYPES[0].value}
                      >
                        <Select options={DISK_TYPES} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="boot_disk_gb"
                        label="Boot disk size (GB)"
                        initialValue={20}
                      >
                        <Slider min={10} max={200} step={5} />
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
                  disabled={!canCreateHosts}
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
            {selected.status === "error" && selected.error && (
                <Alert
                  type="error"
                  showIcon
                  message="Provisioning error"
                  description={selected.error}
                />
              )}
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
