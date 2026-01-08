import { Alert, Button, Card, Divider, Form, Popconfirm, Select, Space, Typography, message } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { HostAiAssist } from "./host-ai-assist";
import { HostCreateForm } from "./host-create-form";

type HostCreateCardProps = {
  vm: HostCreateViewModel;
};

export const HostCreateCard: React.FC<HostCreateCardProps> = ({ vm }) => {
  const { permissions, form, provider, catalogRefresh, ai } = vm;
  const { isAdmin, canCreateHosts } = permissions;
  const {
    form: formInstance,
    creating,
    onCreate,
  } = form;
  const {
    refreshProviders,
    refreshProvider,
    setRefreshProvider,
    refreshCatalog,
    catalogRefreshing,
  } = catalogRefresh;
  const refreshCatalogAndNotify = async () => {
    const ok = await refreshCatalog();
    if (ok) {
      message.success("Cloud catalog updated");
    }
  };
  const confirmCreateHost = async () => {
    try {
      const vals = await formInstance.validateFields();
      await onCreate(vals);
      formInstance.resetFields();
    } catch (err) {
      // validation errors are surfaced by the form; no extra handling needed here
    }
  };
  const watchedRegion = Form.useWatch("region", formInstance);
  const watchedGpuType = Form.useWatch("gpu_type", formInstance);
  const gcpRegionIncompatible = React.useMemo(() => {
    if (provider.selectedProvider !== "gcp") return false;
    if (!watchedGpuType || watchedGpuType === "none") return false;
    const regionOption = (provider.fields.options.region ?? []).find(
      (opt) => opt.value === watchedRegion,
    );
    const meta = (regionOption?.meta ?? {}) as { compatible?: boolean };
    return meta.compatible === false;
  }, [
    provider.fields.options.region,
    provider.selectedProvider,
    watchedGpuType,
    watchedRegion,
  ]);
  const watchedZone = Form.useWatch("zone", formInstance);
  const gcpZoneIncompatible = React.useMemo(() => {
    if (provider.selectedProvider !== "gcp") return false;
    if (!watchedGpuType || watchedGpuType === "none") return false;
    const zoneOption = (provider.fields.options.zone ?? []).find(
      (opt) => opt.value === watchedZone,
    );
    const meta = (zoneOption?.meta ?? {}) as { compatible?: boolean };
    return meta.compatible === false;
  }, [
    provider.fields.options.zone,
    provider.selectedProvider,
    watchedGpuType,
    watchedZone,
  ]);
  const createDisabled = !canCreateHosts || gcpRegionIncompatible || gcpZoneIncompatible;

  return (
    <Card
      title={
        <span>
          <Icon name="plus" /> Create host
        </span>
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
      <HostAiAssist ai={ai} />
      <HostCreateForm
        form={formInstance}
        canCreateHosts={canCreateHosts}
        provider={provider}
      />
      <Divider style={{ margin: "8px 0" }} />
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Typography.Text type="secondary">
          Cost estimate (placeholder): updates with size/region
        </Typography.Text>
        <Popconfirm
          title={
            <div>
              <div>Create this host?</div>
              <div>Provisioning may take a few minutes and can incur costs.</div>
            </div>
          }
          okText="Create"
          cancelText="Cancel"
          onConfirm={confirmCreateHost}
          disabled={createDisabled}
        >
          <Button
            type="primary"
            loading={creating}
            disabled={createDisabled}
            block
          >
            Create host
          </Button>
        </Popconfirm>
      </Space>
      {isAdmin && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          <Space direction="vertical" style={{ width: "100%" }} size="small">
            <Typography.Text type="secondary">Admin tools</Typography.Text>
            <Space size="small" wrap>
              <Select
                size="small"
                value={refreshProvider}
                onChange={(value) => value && setRefreshProvider(value)}
                options={refreshProviders}
                style={{ width: 160 }}
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
          </Space>
        </>
      )}
    </Card>
  );
};
