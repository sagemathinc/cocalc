import { Alert, Button, Card, Divider, Select, Space, Typography, message } from "antd";
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

  return (
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
      <HostAiAssist ai={ai} />
      <HostCreateForm
        form={formInstance}
        canCreateHosts={canCreateHosts}
        provider={provider}
        onCreate={onCreate}
      />
      <Divider style={{ margin: "8px 0" }} />
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Typography.Text type="secondary">
          Cost estimate (placeholder): updates with size/region
        </Typography.Text>
        <Button
          type="primary"
          onClick={() => formInstance.submit()}
          loading={creating}
          disabled={!canCreateHosts}
          block
        >
          Create host
        </Button>
      </Space>
    </Card>
  );
};
