import { Form, message } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useHostActions } from "./use-host-actions";
import { useHostAi } from "./use-host-ai";
import { useHostCatalog } from "./use-host-catalog";
import { useHostCreate } from "./use-host-create";
import { useHostCreateViewModel } from "./use-host-create-view-model";
import { useHostDrawerViewModel } from "./use-host-drawer-view-model";
import { useHostFeatureFlags } from "./use-host-feature-flags";
import { useHostForm } from "./use-host-form";
import { useHostFormValues } from "./use-host-form-values";
import { useHostListViewModel } from "./use-host-list-view-model";
import { useHosts } from "./use-hosts";
import { useHostLog } from "./use-host-log";
import { useHostProviders } from "./use-host-providers";
import { useHostSelection } from "./use-host-selection";

export const useHostsPageViewModel = () => {
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
    selectedGpu,
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
    fieldSchema,
    fieldOptions,
    fieldLabels,
    fieldTooltips,
    supportsPersistentStorage,
    persistentGrowable,
    storageModeOptions,
    showDiskFields,
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
    selectedGpu,
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
    fieldOptions,
  });

  const createVm = useHostCreateViewModel({
    permissions: { isAdmin, canCreateHosts },
    form: { form, creating, onCreate },
    provider: {
      providerOptions,
      selectedProvider: selectedProvider ?? providerOptions[0]?.value ?? "none",
      fields: {
        schema: fieldSchema,
        options: fieldOptions,
        labels: fieldLabels,
        tooltips: fieldTooltips,
      },
      storage: {
        storageModeOptions,
        supportsPersistentStorage,
        persistentGrowable,
        showDiskFields,
      },
      catalogError,
    },
    catalogRefresh: {
      refreshProviders,
      refreshProvider,
      setRefreshProvider,
      refreshCatalog,
      catalogRefreshing,
    },
    ai: {
      aiQuestion: aiPrompt,
      setAiQuestion: setAiPrompt,
      aiBudget,
      setAiBudget,
      aiRegionGroup,
      setAiRegionGroup,
      aiLoading,
      aiError,
      aiResults,
      canRecommend: !!catalogSummary,
      runAiRecommendation,
      applyRecommendation,
    },
  });
  const hostListVm = useHostListViewModel({
    hosts,
    onStart: (id: string) => setStatus(id, "start"),
    onStop: (id: string) => setStatus(id, "stop"),
    onDelete: removeHost,
    onDetails: openDetails,
  });
  const hostDrawerVm = useHostDrawerViewModel({
    open: drawerOpen,
    host: selected,
    onClose: closeDetails,
    hostLog,
    loadingLog,
  });

  return { createVm, hostListVm, hostDrawerVm };
};
