import { Alert, Button, Card, Divider, Popconfirm, Select, Space, Typography, message } from "antd";
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
          disabled={!canCreateHosts}
        >
          <Button
            type="primary"
            loading={creating}
            disabled={!canCreateHosts}
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
