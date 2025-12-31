import { Alert, Button, Card, Divider, Select, Space, Typography, message } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import type { FormInstance } from "antd/es/form";
import type { HostProvider, HostRecommendation } from "../types";
import { HostAiAssist } from "./host-ai-assist";
import { HostCreateForm } from "./host-create-form";

type HostCreateCardProps = {
  isAdmin: boolean;
  canCreateHosts: boolean;
  form: FormInstance;
  creating: boolean;
  providerOptions: Array<{ value: HostProvider; label: string }>;
  selectedProvider: HostProvider;
  regionOptions: Array<{ value: string; label: string }>;
  hyperstackFlavorOptions: Array<{ value: string; label: string }>;
  lambdaInstanceTypeOptions: Array<{ value: string; label: string; disabled?: boolean }>;
  nebiusInstanceTypeOptions: Array<{ value: string; label: string }>;
  zoneOptions: Array<{ value: string; label: string }>;
  machineTypeOptions: Array<{ value: string; label: string }>;
  imageOptions: Array<{ value: string; label: string }>;
  gpuTypeOptions: Array<{ value: string; label: string }>;
  storageModeOptions: Array<{ value: string; label: string }>;
  supportsPersistentStorage: boolean;
  persistentGrowable: boolean;
  showDiskFields: boolean;
  catalogError?: string;
  refreshProviders: Array<{ value: HostProvider; label: string }>;
  refreshProvider: HostProvider;
  setRefreshProvider: (value: HostProvider) => void;
  refreshCatalog: () => Promise<boolean>;
  catalogRefreshing: boolean;
  aiQuestion: string;
  setAiQuestion: (value: string) => void;
  aiBudget?: number;
  setAiBudget: (value?: number) => void;
  aiRegionGroup: string;
  setAiRegionGroup: (value: string) => void;
  aiLoading: boolean;
  aiError?: string;
  aiResults: HostRecommendation[];
  canRecommend: boolean;
  runAiRecommendation: () => void;
  applyRecommendation: (rec: HostRecommendation) => void;
  onCreate: (vals: any) => Promise<void>;
};

export const HostCreateCard: React.FC<HostCreateCardProps> = ({
  isAdmin,
  canCreateHosts,
  form,
  creating,
  providerOptions,
  selectedProvider,
  regionOptions,
  hyperstackFlavorOptions,
  lambdaInstanceTypeOptions,
  nebiusInstanceTypeOptions,
  zoneOptions,
  machineTypeOptions,
  imageOptions,
  gpuTypeOptions,
  storageModeOptions,
  supportsPersistentStorage,
  persistentGrowable,
  showDiskFields,
  catalogError,
  refreshProviders,
  refreshProvider,
  setRefreshProvider,
  refreshCatalog,
  catalogRefreshing,
  aiQuestion,
  setAiQuestion,
  aiBudget,
  setAiBudget,
  aiRegionGroup,
  setAiRegionGroup,
  aiLoading,
  aiError,
  aiResults,
  canRecommend,
  runAiRecommendation,
  applyRecommendation,
  onCreate,
}) => {
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
      <HostAiAssist
        aiQuestion={aiQuestion}
        setAiQuestion={setAiQuestion}
        aiBudget={aiBudget}
        setAiBudget={setAiBudget}
        aiRegionGroup={aiRegionGroup}
        setAiRegionGroup={setAiRegionGroup}
        aiLoading={aiLoading}
        aiError={aiError}
        aiResults={aiResults}
        canRecommend={canRecommend}
        runAiRecommendation={runAiRecommendation}
        applyRecommendation={applyRecommendation}
      />
      <HostCreateForm
        form={form}
        canCreateHosts={canCreateHosts}
        providerOptions={providerOptions}
        selectedProvider={selectedProvider}
        regionOptions={regionOptions}
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
      <Space direction="vertical" style={{ width: "100%" }} size="small">
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
  );
};
