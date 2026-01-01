import { Form, message } from "antd";
import { React } from "@cocalc/frontend/app-framework";
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
import { buildRegionGroupOptions } from "../utils/normalize-catalog";
import type { HostListViewMode } from "../types";

export const useHostsPageViewModel = () => {
  const hub = webapp_client.conat_client.hub;
  const [form] = Form.useForm();
  const isAdmin = useTypedRedux("account", "is_admin");
  const flags = useHostFeatureFlags();

  const { hosts, setHosts, refresh, canCreateHosts } = useHosts(hub, {
    onError: () => message.error("Unable to load hosts"),
  });
  const { setStatus, removeHost, renameHost } = useHostActions({
    hub,
    setHosts,
    refresh,
  });
  const [editingHost, setEditingHost] = React.useState<typeof hosts[number]>();
  const [editOpen, setEditOpen] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const { drawerOpen, selected, openDetails, closeDetails } = useHostSelection(hosts);
  const openEdit = (host: typeof hosts[number]) => {
    setEditingHost(host);
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditingHost(undefined);
  };
  const { hostLog, loadingLog } = useHostLog(hub, selected?.id, {
    enabled: drawerOpen,
    limit: 50,
  });
  const [hostViewMode, setHostViewMode] =
    React.useState<HostListViewMode>("grid");

  const {
    providerOptions,
    refreshProviders,
    selectedProvider,
    catalogProvider,
    refreshProvider,
    setRefreshProvider,
  } = useHostProviders({
    form,
    flags,
  });
  const enabledProviders = providerOptions.map((option) => option.value);
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
    enabledProviders,
  });
  const regionOptions = buildRegionGroupOptions(catalogSummary);

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
  } = useHostAi({
    catalogSummary,
    availableProviders: enabledProviders,
    regionOptions,
  });

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
      regionOptions,
    },
  });
  const hostListVm = useHostListViewModel({
    hosts,
    onStart: (id: string) => setStatus(id, "start"),
    onStop: (id: string) => setStatus(id, "stop"),
    onDelete: removeHost,
    onDetails: openDetails,
    onEdit: openEdit,
    viewMode: hostViewMode,
    setViewMode: setHostViewMode,
  });
  const hostDrawerVm = useHostDrawerViewModel({
    open: drawerOpen,
    host: selected,
    onClose: closeDetails,
    onEdit: openEdit,
    hostLog,
    loadingLog,
  });

  const editVm = {
    open: editOpen,
    host: editingHost,
    saving: savingEdit,
    onCancel: closeEdit,
    onSave: async (id: string, name: string) => {
      setSavingEdit(true);
      await renameHost(id, name);
      setSavingEdit(false);
      closeEdit();
    },
  };

  return { createVm, hostListVm, hostDrawerVm, editVm };
};
