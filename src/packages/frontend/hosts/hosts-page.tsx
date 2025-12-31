import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Row,
  Select,
  Space,
  Typography,
  message,
} from "antd";
import {
  React,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider, HostRecommendation } from "./types";
import { HostAiAssist } from "./components/host-ai-assist";
import { HostCreateForm } from "./components/host-create-form";
import { HostDrawer } from "./components/host-drawer";
import { HostList } from "./components/host-list";
import { useHostActions } from "./hooks/use-host-actions";
import { useHostAi } from "./hooks/use-host-ai";
import { useHostCatalog } from "./hooks/use-host-catalog";
import { useHostCreate } from "./hooks/use-host-create";
import { useHostForm } from "./hooks/use-host-form";
import { useHosts } from "./hooks/use-hosts";
import { useHostLog } from "./hooks/use-host-log";
import { useHostProviders } from "./hooks/use-host-providers";
import { WRAP_STYLE } from "./constants";


export const HostsPage: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Host | undefined>(undefined);
  const hub = webapp_client.conat_client.hub;
  const [form] = Form.useForm();
  const isAdmin = useTypedRedux("account", "is_admin");
  const gcpEnabled = useTypedRedux(
    "customize",
    "compute_servers_google-cloud_enabled",
  );
  const hyperstackEnabled = useTypedRedux(
    "customize",
    "compute_servers_hyperstack_enabled",
  );
  const lambdaEnabled = useTypedRedux(
    "customize",
    "compute_servers_lambda_enabled",
  );
  const nebiusEnabled = useTypedRedux(
    "customize",
    "project_hosts_nebius_enabled",
  );
  const showLocal =
    typeof window !== "undefined" && window.location.hostname === "localhost";

  const { hosts, setHosts, refresh, canCreateHosts } = useHosts(hub, {
    onError: () => message.error("Unable to load hosts"),
  });
  const { setStatus, removeHost } = useHostActions({
    hub,
    setHosts,
    refresh,
  });
  const { hostLog, loadingLog } = useHostLog(hub, selected?.id, {
    enabled: drawerOpen,
    limit: 50,
  });

  const {
    providerOptions,
    refreshProviders,
    selectedProvider,
    refreshProvider,
    setRefreshProvider,
  } = useHostProviders({
    form,
    gcpEnabled: !!gcpEnabled,
    hyperstackEnabled: !!hyperstackEnabled,
    lambdaEnabled: !!lambdaEnabled,
    nebiusEnabled: !!nebiusEnabled,
    showLocal,
  });
  const selectedRegion = Form.useWatch("region", form);
  const selectedZone = Form.useWatch("zone", form);
  const selectedMachineType = Form.useWatch("machine_type", form);
  const selectedGpuType = Form.useWatch("gpu_type", form);
  const selectedSourceImage = Form.useWatch("source_image", form);
  const selectedSize = Form.useWatch("size", form);
  const selectedStorageMode = Form.useWatch("storage_mode", form);

  const catalogProvider: HostProvider | undefined =
    selectedProvider === "gcp"
      ? "gcp"
      : selectedProvider === "hyperstack"
        ? "hyperstack"
        : selectedProvider === "lambda"
          ? "lambda"
          : selectedProvider === "nebius"
            ? "nebius"
            : gcpEnabled
              ? "gcp"
              : hyperstackEnabled
                ? "hyperstack"
                : lambdaEnabled
                  ? "lambda"
                  : nebiusEnabled
                    ? "nebius"
                    : undefined;

  const { catalog, catalogError, catalogRefreshing, refreshCatalog } =
    useHostCatalog(hub, {
      provider: catalogProvider,
      refreshProvider,
      onError: (text) => message.error(text),
    });

  const {
    supportsPersistentStorage,
    persistentGrowable,
    storageModeOptions,
    showDiskFields,
    hyperstackRegionOptions,
    lambdaInstanceTypeOptions,
    nebiusInstanceTypeOptions,
    lambdaRegionOptions,
    nebiusRegionOptions,
    regionOptions,
    zoneOptions,
    machineTypeOptions,
    hyperstackFlavorOptions,
    gpuTypeOptions,
    imageOptions,
    catalogSummary,
  } = useHostForm({
    form,
    catalog,
    selectedProvider,
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedSourceImage,
    selectedSize,
    selectedStorageMode,
    lambdaEnabled: !!lambdaEnabled,
  });

  const {
    aiPrompt,
    setAiPrompt,
    aiBudget,
    setAiBudget,
    aiRegionGroup,
    setAiRegionGroup,
    aiLoading,
    aiError,
    aiResults,
    runAiRecommendation,
  } = useHostAi({ catalogSummary });

  const { creating, onCreate } = useHostCreate({
    hub,
    refresh,
    hyperstackFlavorOptions,
    hyperstackRegionOptions,
    lambdaInstanceTypeOptions,
    lambdaRegionOptions,
    nebiusInstanceTypeOptions,
    nebiusRegionOptions,
  });


  useEffect(() => {
    if (!supportsPersistentStorage) {
      form.setFieldsValue({ storage_mode: "ephemeral" });
    } else if (!form.getFieldValue("storage_mode")) {
      form.setFieldsValue({ storage_mode: "persistent" });
    }
  }, [supportsPersistentStorage, form]);

  useEffect(() => {
    if (!selected) return;
    const updated = hosts.find((h) => h.id === selected.id);
    setSelected(updated);
  }, [hosts, selected?.id]);


  const applyRecommendation = (rec: HostRecommendation) => {
    if (!rec.provider) return;
    const next: Record<string, any> = { provider: rec.provider };
    if (rec.provider === "gcp") {
      if (rec.region) next.region = rec.region;
      if (rec.zone) next.zone = rec.zone;
      if (rec.machine_type) next.machine_type = rec.machine_type;
      if (rec.gpu_type) next.gpu_type = rec.gpu_type;
      if (rec.source_image) next.source_image = rec.source_image;
    } else if (rec.provider === "hyperstack") {
      if (rec.region) next.region = rec.region;
      if (rec.flavor) next.size = rec.flavor;
    } else if (rec.provider === "lambda") {
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
    } else if (rec.provider === "nebius") {
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
    }
    if (rec.disk_gb) next.disk = rec.disk_gb;
    form.setFieldsValue(next);
  };

  const refreshCatalogAndNotify = async () => {
    const ok = await refreshCatalog();
    if (ok) {
      message.success("Cloud catalog updated");
    }
  };

  const regionField = (
    <Form.Item name="region" label="Region" initialValue="us-east1">
      <Select
        options={regionOptions}
        disabled={selectedProvider === "none"}
      />
    </Form.Item>
  );

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
                <Space size="small">
                  <Select
                    size="small"
                    value={refreshProvider}
                    onChange={(value) => value && setRefreshProvider(value)}
                    options={refreshProviders}
                    style={{ width: 140 }}
                  />
                  <Button
                    size="small"
                    onClick={refreshCatalogAndNotify}
                    loading={catalogRefreshing}
                    disabled={!refreshProviders.length}
                  >
                    Refresh catalog
                  </Button>
                </Space>
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
            <HostAiAssist
              aiQuestion={aiPrompt}
              setAiQuestion={setAiPrompt}
              aiBudget={aiBudget}
              setAiBudget={setAiBudget}
              aiRegionGroup={aiRegionGroup}
              setAiRegionGroup={setAiRegionGroup}
              aiLoading={aiLoading}
              aiError={aiError}
              aiResults={aiResults}
              canRecommend={!!catalogSummary}
              runAiRecommendation={runAiRecommendation}
              applyRecommendation={applyRecommendation}
            />
            <HostCreateForm
              form={form}
              canCreateHosts={canCreateHosts}
              providerOptions={providerOptions}
              selectedProvider={
                selectedProvider ?? providerOptions[0]?.value ?? "none"
              }
              regionField={regionField}
              hyperstackFlavorOptions={hyperstackFlavorOptions}
              lambdaInstanceTypeOptions={lambdaInstanceTypeOptions}
              nebiusInstanceTypeOptions={nebiusInstanceTypeOptions}
              zoneOptions={zoneOptions}
              machineTypeOptions={machineTypeOptions}
              imageOptions={imageOptions}
              gpuTypeOptions={gpuTypeOptions}
              storageModeOptions={storageModeOptions}
              supportsPersistentStorage={supportsPersistentStorage}
              persistentGrowable={persistentGrowable}
              showDiskFields={showDiskFields}
              catalogError={catalogError}
              onCreate={onCreate}
            />
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
                onClick={() => form.submit()}
                loading={creating}
                disabled={!canCreateHosts}
                block
              >
                Create host
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <HostList
            hosts={hosts}
            onStart={(id) => setStatus(id, "start")}
            onStop={(id) => setStatus(id, "stop")}
            onDelete={removeHost}
            onDetails={(host) => {
              setSelected(host);
              setDrawerOpen(true);
            }}
          />
        </Col>
      </Row>
      <HostDrawer
        open={drawerOpen}
        host={selected}
        onClose={() => setDrawerOpen(false)}
        hostLog={hostLog}
        loadingLog={loadingLog}
      />
    </div>
  );
};
