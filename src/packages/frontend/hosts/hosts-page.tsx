import { Col, Form, Row, message } from "antd";
import { React, useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { HostCreateCard } from "./components/host-create-card";
import { HostDrawer } from "./components/host-drawer";
import { HostList } from "./components/host-list";
import { useHostActions } from "./hooks/use-host-actions";
import { useHostAi } from "./hooks/use-host-ai";
import { useHostCatalog } from "./hooks/use-host-catalog";
import { useHostCreate } from "./hooks/use-host-create";
import { useHostFeatureFlags } from "./hooks/use-host-feature-flags";
import { useHostForm } from "./hooks/use-host-form";
import { useHostFormValues } from "./hooks/use-host-form-values";
import { useHosts } from "./hooks/use-hosts";
import { useHostLog } from "./hooks/use-host-log";
import { useHostProviders } from "./hooks/use-host-providers";
import { useHostSelection } from "./hooks/use-host-selection";
import { WRAP_STYLE } from "./constants";


export const HostsPage: React.FC = () => {
  const hub = webapp_client.conat_client.hub;
  const [form] = Form.useForm();
  const isAdmin = useTypedRedux("account", "is_admin");
  const {
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
    showLocal,
  } = useHostFeatureFlags();

  const { hosts, setHosts, refresh, canCreateHosts } = useHosts(hub, {
    onError: () => message.error("Unable to load hosts"),
  });
  const { setStatus, removeHost } = useHostActions({
    hub,
    setHosts,
    refresh,
  });
  const { drawerOpen, selected, openDetails, closeDetails } = useHostSelection(hosts);
  const { hostLog, loadingLog } = useHostLog(hub, selected?.id, {
    enabled: drawerOpen,
    limit: 50,
  });

  const {
    providerOptions,
    refreshProviders,
    selectedProvider,
    catalogProvider,
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
  const {
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedSourceImage,
    selectedSize,
    selectedStorageMode,
  } = useHostFormValues(form);

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
    applyRecommendation,
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


  return (
    <div className="smc-vfill" style={WRAP_STYLE}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <HostCreateCard
            isAdmin={isAdmin}
            canCreateHosts={canCreateHosts}
            form={form}
            creating={creating}
            providerOptions={providerOptions}
            selectedProvider={selectedProvider ?? providerOptions[0]?.value ?? "none"}
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
            refreshProviders={refreshProviders}
            refreshProvider={refreshProvider}
            setRefreshProvider={setRefreshProvider}
            refreshCatalog={refreshCatalog}
            catalogRefreshing={catalogRefreshing}
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
            onCreate={onCreate}
          />
        </Col>
        <Col xs={24} lg={12}>
          <HostList
            hosts={hosts}
            onStart={(id) => setStatus(id, "start")}
            onStop={(id) => setStatus(id, "stop")}
            onDelete={removeHost}
            onDetails={openDetails}
          />
        </Col>
      </Row>
      <HostDrawer
        open={drawerOpen}
        host={selected}
        onClose={closeDetails}
        hostLog={hostLog}
        loadingLog={loadingLog}
      />
    </div>
  );
};
